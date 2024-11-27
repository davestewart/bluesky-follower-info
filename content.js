// ---------------------------------------------------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------------------------------------------------

function isOlderThan (time, days = 1) {
  const DAY = 1000 * 60 * 60 * 24
  const period = DAY * days
  return time && Date.now() - (time + period) > 0
}

function stripEmojis (text) {
  const rx = /[\u{1F000}-\u{1F9FF}]|[\u2600-\u27FF]|[\u2300-\u23FF}]|[\u{2B00}-\u{2BFF}]|[\u2900-\u297F]|[\u2700-\u27BF]|[\uE000-\uF8FF]|[\u{1F900}-\u{1F9FF}]|[\u2E00-\u2E7F]|\uFE0F/gu
  return text.replace(rx, '')
}

function makeIcon (icon, title) {
  return `<span style="font-size:1.2em" title="${title}">${icon}</span>`
}

const { format } = new Intl.NumberFormat('en-US', {
  // notation: 'compact',
  // compactDisplay: 'short'
})

// ---------------------------------------------------------------------------------------------------------------------
// classes
// ---------------------------------------------------------------------------------------------------------------------

const Storage = {
  async get (key) {
    const { [key]: value } = await chrome.storage.local.get({ [key]: {} })
    return value
  },
  async set (key, value) {
    await chrome.storage.local.set({ [key]: value })
  }
}

const Api = {
  config: {
    url: '',
    token: ''
  },

  async init () {
    const result = await chrome.runtime.sendMessage({ type: 'GET_API_INFO' })
    if (result) {
      Object.assign(this.config, result)
      return result
    }
  },

  async get (path, data) {
    return this.call('get', path, data)
  },

  async post (path, data) {
    return this.call('post', path, data)
  },

  call (method, path, data = undefined) {
    // variables
    const isGet = method.toLowerCase() === 'get'
    const { url, token } = this.config
    const options = {
      headers: {
        authorization: `Bearer ${token}`
      }
    }

    // add body for non-get requests if data is provided
    if (data && !isGet) {
      options.body = JSON.stringify(data)
    }

    // for get requests with data, append as query parameters
    else if (data && isGet) {
      const queryParams = new URLSearchParams(data).toString()
      path = `${path}${path.includes('?') ? '&' : '?'}${queryParams}`
    }

    // make the request
    return fetch(`${url}xrpc/${path}`, options)
      .then(async (res) => {
        if (!res.ok) {
          // if the token is invalid, get the latest
          if (res.status === 401) {
            await this.init()
            return this.call(method, path, data)
          }
          return null
        }

        // return
        const data = await res.json()
        return data
      })
      .catch(error => {
        console.error('Fetch error:', error)
        throw error
      })
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------------------------------------------------

class Profile {
  /**
   * @type {string}
   */
  handle

  /**
   * @type {{ viewer: { following: string | undefined }, description: string | undefined, followsCount: number, followersCount: number, postsCount: number }}
   */
  data

  /**
   * @type {number}
   */
  created

  /**
   * @type {number}
   */
  updated

  get storageKey () {
    return `profile:${this.handle}`
  }

  get isStale () {
    return this.data && this.updated && isOlderThan(this.updated, 7)
  }

  get isOld () {
    return this.data && this.updated && isOlderThan(this.updated, 14)
  }

  constructor (handle) {
    this.handle = handle
  }

  async load () {
    const item = await Storage.get(this.storageKey)
    this.created = item.created
    this.updated = item.updated
    this.data = item.data
    return this
  }

  async save () {
    const NOW = Date.now()
    const item = {
      created: this.created || NOW,
      updated: NOW,
      data: this.data
    }
    // console.log('Saving profile')
    void Storage.set(this.storageKey, item)
    return this
  }

  async fetch () {
    this.data = await Api.get('app.bsky.actor.getProfile', { actor: this.handle })
    return this
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
async function processElement (element) {
  let info
  if (predicates.isListItem(element)) {
    info = createInfo('list', element)
  }
  else if (predicates.isFeedItem(element)) {
    info = createInfo('feed', element)
  }
  if (info) {
    const actor = element.getAttribute('href').match(/profile\/([^/]+)/)[1]
    if (actor) {
      // create profile class
      const profile = new Profile(actor)

      // load from cache
      await profile.load()
      if (profile.data) {
        renderInfo(info, profile)
      }

      // possibly refresh
      if (!profile.data || profile.isStale) {
        await profile.fetch()
        if (profile.data) {
          void profile.save()
          renderInfo(info, profile)
        }
      }
    }
  }
}

function createInfo (type, element, parent) {
  // content
  const infoContent = document.createElement('div')
  infoContent.innerHTML = '<span style="opacity: 0.6">Loading...</span> '
  infoContent.style = `
    font-size: 12px;
    font-weight: 400;
    -webkit-font-smoothing: subpixel-antialiased;
    white-space: normal;
    letter-spacing: 0.25px;
  `

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

  // return
  return infoContent
}

/**
 * Render info
 *
 * @param   {HTMLElement}   el
 * @param   {Profile}       profile
 */
function renderInfo (el, profile) {
  const { data } = profile
  if (data) {
    // variables
    let { description, followsCount, followersCount, postsCount } = data

    // if we have a description, condense it
    description = description?.trim()
    if (description) {
      description = stripEmojis(description)
        .split(/[\n\r]+/g) // linebreaks
        .map(line => line.replace(/[\s\u200B-\u200D\uFEFF\u00A0\u1680\u180E\u2000-\u200F\u202F\u205F\u3000\u2028\u2029\uFE0F]/g, ' ').trim()) // remove space characters
        .filter(line => line.length > 0) // trim empty lines
        .join(' | ') // join
    }

    // build html
    const ageStyle = profile.isOld
      ? 'opacity: 0.6'
      : 'color: #5292d7'
    const followingIcon = data.viewer?.following
      ? makeIcon('👋', 'You are following this user')
      : ''
    const postsIcon = postsCount >= 25
      ? makeIcon('✅', 'User is engaged')
      : postsCount > 1
        ? makeIcon('📝️', 'User has posted')
        : ''
    const statusIcon = followersCount > followsCount
      ? makeIcon('🔥', 'User is popular')
      : ''
    const info = `
      ${postsIcon} <span style="opacity: 0.6">Posts: ${format(postsCount)} |</span> 
      ${statusIcon} <span style="opacity: 0.6">Followers: ${format(followersCount)} | Following: ${format(followsCount)}</span>
      `
    const htmlDescription = `<div style="${ageStyle}; white-space: pre-wrap">${description}</div>`
    const htmlInfo = `<div style="${description ? 'margin-top: 0.4em;' : ''}">${info}</div>`

    // set html
    el.innerHTML = description
      ? htmlDescription + '\n\n' + htmlInfo
      : htmlInfo
  }
  else {
    el.innerHTML = 'Could not load profile!'
    el.style.color = 'red'
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
        void processElement(entry.target)
        // stop observing once processed
        observeVisibility.unobserve(entry.target)
      }
    })
  }, {
    rootMargin: '100px 0px', // 100px above and below viewport
    threshold: 0
  })

  // target profile links
  const selector = 'a[href^="/profile/"]:not(.hasProfile)'

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
  const result = await Api.init()
  if (result) {
    setupPage()
  }
  else {
    setTimeout(start, 1000)
  }
}

void start()
