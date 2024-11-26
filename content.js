// ---------------------------------------------------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------------------------------------------------

const storage = {
  async get (key) {
    const { [key]: value } = await chrome.storage.local.get({ [key]: '' })
    return value
  },
  async set (key, value) {
    await chrome.storage.local.set({ [key]: value })
  }
}

const API = {
  url: '',
  token: ''
}

async function setupApi () {
  const result = await chrome.runtime.sendMessage({ type: 'GET_API_INFO' })
  if (result) {
    Object.assign(API, result)
    return result
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// elements
// ---------------------------------------------------------------------------------------------------------------------

const predicates = {
  inList: e => !!e.parentElement?.parentElement?.firstElementChild?.firstElementChild?.matches('[aria-label="Hide user list"]'),
  inSummary: e => !!e.closest('[role="presentation"]') || e.parentElement?.innerText.includes(' others followed you'),
  hasAvatar: e => !!e.querySelector('[data-testid="userAvatarImage"]'),
  inFollowedYou: e => e.closest('[aria-label*="followed you"]'),
  isListItem: e => predicates.inList(e) && predicates.hasAvatar(e),
  isFeedItem: e => predicates.inFollowedYou(e) && !predicates.inList(e) && !predicates.inSummary(e) && !predicates.hasAvatar(e)
}

// process each element based on its type
function processElement (element) {
  if (predicates.isListItem(element)) {
    void createInfo('list', element)
  }
  else if (predicates.isFeedItem(element)) {
    void createInfo('feed', element)
  }
}

async function createInfo (type, element, parent) {
  // profile
  const actor = element.getAttribute('href').match(/profile\/([^/]+)/)[1]

  // content
  const infoContent = document.createElement('div')
  infoContent.style = `
    font-size: 12px;
    font-weight: 400;
    -webkit-font-smoothing: subpixel-antialiased;
    letter-spacing: 0.25px;
    color: #5292d7;
  `
  infoContent.innerHTML = `Loading ${actor} profile...`

  // elements
  if (type === 'feed') {
    infoContent.style.marginTop = '5px'
    parent = element.parentElement
  }

  else if (type === 'list') {
    // elements
    const wrapper = document.createElement('div')
    const [avatar, textContent] = element.childNodes

    // re-layout components
    element.insertBefore(wrapper, textContent)
    wrapper.appendChild(textContent)
    parent = wrapper

    // style content
    avatar.style.paddingTop = '3px'
    wrapper.style.paddingLeft = '4px'
    textContent.style.paddingBottom = '3px'
    infoContent.style.fontSize = '12px'

    // reset original wrapper
    element.style.height = ''
    element.style.alignItems = 'flex-start'
    element.style.marginBottom = '5px'

    // hack! parent element slides open; reset height when it is open
    element.parentElement.style.height = ''
    setTimeout(() => {
      element.parentElement.style.height = ''
    }, 200)
  }

  // append element
  parent.appendChild(infoContent)

  // render description
  try {
    const key = `actor-description:${actor}`
    let description = await storage.get(key)
    if (!description) {
      const profile = await loadProfile(actor)
      description = profile.description
      if (description) {
        void storage.set(key, description)
      }
    }
    infoContent.innerHTML = description || '...'
  }
  catch (err) {
    infoContent.innerHTML = '...'
    console.log(err)
  }
}

async function loadProfile (actor) {
  try {
    const res = await fetch(`${API.url}xrpc/app.bsky.actor.getProfile?actor=${actor}`, {
      headers: {
        authorization: `Bearer ${API.token}`
      }
    })
    return res.json()
  }
  catch (error) {
    await setupApi()
    return loadProfile(actor)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// observe dom
// ---------------------------------------------------------------------------------------------------------------------

function setupPage () {
  // create an intersection observer to detect when elements are in view
  const observeVisibility = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        processElement(entry.target)
        // stop observing once processed
        observeVisibility.unobserve(entry.target)
      }
    })
  }, {
    rootMargin: '100px 0px', // 100px above and below viewport
    threshold: 0
  })

  // target profile links
  const selector = 'a[href^="/profile/"]'

  // create a mutation observer to detect when new elements are added
  const observeDOM = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // check for added nodes
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // check if the added node itself is a profile link
          if (node.matches(selector)) {
            observeVisibility.observe(node)
          }
          // check for profile links within the added node
          node.querySelectorAll(selector).forEach(element => {
            observeVisibility.observe(element)
          })
        }
      })
    })
  })

  // start observing the document for changes
  observeDOM.observe(document.body, {
    childList: true,
    subtree: true
  })

  // process any existing elements that are already on the page
  document.querySelectorAll(selector).forEach(element => {
    observeVisibility.observe(element)
  })

  // cleanup function (call this when you want to stop observing)
  return function cleanup () {
    observeDOM.disconnect()
    observeVisibility.disconnect()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------------------------------------------------

async function start () {
  const result = await setupApi()
  if (result) {
    setupPage()
  }
  else {
    setTimeout(start, 1000)
  }
}

void start()
