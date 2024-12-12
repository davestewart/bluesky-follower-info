// ---------------------------------------------------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------------------------------------------------

const NAME = '[bluesky-follower-info]'

function log (...args) {
  console.log(NAME, ...args)
}

function warn (...args) {
  console.warn(NAME, ...args)
}

const { format } = new Intl.NumberFormat('en-US', {
  // notation: 'compact',
  // compactDisplay: 'short'
})

function isOlderThan (time, days = 1) {
  const DAY = 1000 * 60 * 60 * 24
  const period = DAY * days
  return time && Date.now() - (time + period) > 0
}

function stripEmojis (text) {
  const emojisAndFlags = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F18D}\u{1F191}-\u{1F19A}\u{1F1E6}-\u{1F1FF}\u{1F000}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F201}-\u{1F2FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}][\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}]?/gu
  return text
    .replace(emojisAndFlags, '')
    .replace(/\u200D/g, '')
}

// ---------------------------------------------------------------------------------------------------------------------
// classes
// ---------------------------------------------------------------------------------------------------------------------

const Storage = {
  // update version if options format changes (use manifest version)
  version: '1.5.0',

  async init () {
    // clear storage if version has changed
    const version = await Storage.get('version')
    if (version !== this.version) {
      await chrome.storage.local.clear()
      await this.set('version', this.version)
      return
    }

    // remove follows older than a month
    const keys = []
    const items = await chrome.storage.local.get(null)
    for (const key of Object.keys(items)) {
      const item = items[key]
      if (item.created && isOlderThan(item.created, 30)) {
        keys.push(key)
      }
    }
    if (keys.length > 0) {
      log(`Removing ${keys.length} old profiles`)
      await this.remove(keys)
    }
  },

  async get (key) {
    const { [key]: value } = await chrome.storage.local.get({ [key]: {} })
    return value
  },

  async set (key, value) {
    await chrome.storage.local.set({ [key]: value })
  },

  async remove (key) {
    await chrome.storage.local.remove(key)
  }
}

const Api = {
  config: {
    url: '',
    token: ''
  },

  async init () {
    const result = await chrome.runtime.sendMessage({ type: 'GET_API' })
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
    let fullPath = path
    const options = {
      method,
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json'
      }
    }

    // add body for non-get requests if data is provided
    if (data && !isGet) {
      options.body = JSON.stringify(data)
    }

    // for get requests with data, append as query parameters
    else if (data && isGet) {
      const queryParams = new URLSearchParams(data).toString()
      fullPath = `${path}${path.includes('?') ? '&' : '?'}${queryParams}`
    }

    // make the request
    return fetch(`${url}xrpc/${fullPath}`, options)
      .then(async (res) => {
        if (!res.ok) {
          // if the token is invalid, get the latest
          if (res.status >= 400) {
            const err = await res.json()
            if (err.error === 'ExpiredToken') {
              log('Refreshing token...')
              await this.init()
              return this.call(method, path, data)
            }
            log(err)
          }
          return null
        }

        // return data
        return res.headers.get('content-type')?.includes('application/json')
          ? res.json()
          : res.text()
      })
      .catch(error => {
        warn('Fetch error:', error)
        throw error
      })
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Describes the profile data that is saved
 *
 * @typedef ProfileData
 * @property {string}   [description]
 * @property {number}   followingCount
 * @property {number}   followersCount
 * @property {number}   postsCount
 * @property {boolean}  following
 */

class Profile {
  /**
   * @type {string}
   */
  handle

  /**
   * @type {ProfileData}
   */
  data

  /**
   * @type {boolean}
   */
  visible

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
    return this.data && this.updated && isOlderThan(this.updated, options.thresholds.updated)
  }

  get isOld () {
    return this.data && this.created && isOlderThan(this.updated, options.thresholds.created)
  }

  static pool = {}

  static get (handle) {
    let profile = this.pool[handle]
    if (!profile) {
      this.pool[handle] = profile = new Profile(handle)
    }
    return profile
  }

  constructor (handle) {
    this.handle = handle
    this.visible = options.behavior.expandProfiles
  }

  async load () {
    const item = await Storage.get(this.storageKey)
    if (item) {
      this.created = item.created
      this.updated = item.updated
      this.visible = item.visible ?? this.visible
      this.data = item.data
    }
    return this
  }

  async save () {
    const NOW = Date.now()
    const item = {
      created: this.created || NOW,
      updated: NOW,
      visible: this.visible,
      data: this.data
    }
    void Storage.set(this.storageKey, item)
    return this
  }

  async fetch () {
    if (!this.created) {
      await this.load()
    }

    // load data
    const data = await Api.get('app.bsky.actor.getProfile', { actor: this.handle })
    const { description, followsCount: followingCount, followersCount, postsCount, viewer } = data
    this.data = {
      description,
      followingCount,
      followersCount,
      postsCount,
      following: !!viewer?.following
    }

    // return
    return this
  }

  async show (state = true) {
    this.visible = state
    await this.save()
  }

  async mute (state = true) {
    const method = state ? 'mute' : 'unmute'
    await Api.post(`app.bsky.graph.${method}Actor`, { actor: this.handle })
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------------------------------------------------

// need to sniff by label content
const i18n = {
  en: {
    aria: {
      listHide: 'Hide user list',
      listFollowed: 'followed you',
      listLiked: 'liked your post',
      listReposted: 'reposted your post',
      feedFollowed: 'followed you',
      avatar: ' avatar',
      follow: 'Follow',
      following: 'Following'
    },
    labels: {
      posts: 'Posts',
      followers: 'Followers',
      following: 'Following',
      follow: 'Follow'
    }
  },
  fr: {
    aria: {
      listHide: 'Cacher la liste des comptes',
      listFollowed: 'vous ont suivi',
      listLiked: 'aimé votre post',
      listReposted: 'republié votre post',
      feedFollowed: 'suivi votre compte',
      avatar: 'avatar de',
      follow: 'Suivre',
      following: 'Suivi'
    },
    labels: {
      posts: 'Posts',
      followers: 'Abonnés',
      following: 'Abonnements'
    }
  },
  es: {
    aria: {
      listHide: 'Ocultar lista de usuarios',
      listFollowed: 'más te siguieron',
      listLiked: 'más dieron "me gusta" a tu publicación',
      listReposted: 'más republicaron tu publicación',
      feedFollowed: 'te siguió',
      avatar: 'avatar de',
      follow: 'Seguir',
      following: 'Siguiendo'
    },
    labels: {
      posts: 'Publications',
      followers: 'Seguidores',
      following: 'Siguiendo'
    }
  }
}

function getLang (fallback = '') {
  const locale = document.querySelector('html').lang || ''
  const [lang] = locale.split('-')
  return i18n[lang] ?? i18n[fallback]
}

// ---------------------------------------------------------------------------------------------------------------------
// sniff elements
// ---------------------------------------------------------------------------------------------------------------------

/**
 * @typedef {'starter'|'list'|'feed'} TargetType
 */

/**
 * Describes the target elements and relations
 *
 * @typedef ContentModel
 * @property {string}       handle        The user's handle
 * @property {TargetType}   type          The type of element
 * @property {HTMLElement}  element       The containing element
 * @property {HTMLElement}  avatar        The avatar item within the element
 * @property {HTMLElement}  target        The target element to attach any content to
 * @property {HTMLElement}  [content]     The attached content element
 * @property {HTMLElement}  [list]        Any containing list element
 */

/**
 * Returns element model
 *
 * @param   {HTMLLinkElement} link
 * @return  {ContentModel|undefined}
 */
function getContentModel (link) {
  // supported languages
  const aria = getLang()?.aria
  if (!aria) {
    return
  }

  // helpers
  const getAvatar = el => el.querySelector('[data-testid="userAvatarImage"],[data-testid="userAvatarFallback"]')
    ?.parentElement
    ?.parentElement
    ?.parentElement
    ?.parentElement

  // variables
  const href = link.getAttribute('href')
  const handle = href.match(/profile\/([^/]+)/)[1]
  let list, element

  // -------------------------------------------------------------------------------------------------------------------
  // starter pack
  // -------------------------------------------------------------------------------------------------------------------

  if (location.pathname.startsWith('/starter-pack/')) {
    const button = link.querySelector('button')
    if (button) {
      const avatar = getAvatar(link)
      if (avatar) {
        return {
          handle,
          type: 'starter',
          element: link,
          target: link.querySelector('[data-word-wrap="1"]'),
          avatar
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // notifications
  // -------------------------------------------------------------------------------------------------------------------

  // multi-avatar containers indicate list elements
  const summary = link.closest('[role="presentation"]')

  // pass 1: identify list and container, then skip summary avatars
  if (summary) {
    const container = summary.closest('[data-testid^="feedItem-by"]')
    if (container) {
      // note: these operations ensure pass 2 works correctly
      delete container.dataset.testid
      summary.nextElementSibling?.classList.add('bfi-list')

      // only process lists if included in options
      const description = summary.nextElementSibling.nextElementSibling.getAttribute('aria-label')
      const isFollowed = description.includes(aria.listFollowed)
      const isReposted = description.includes(aria.listReposted)
      const isLiked = description.includes(aria.listLiked)
      if ((isFollowed && !options.process.listFollowed) || (isReposted && !options.process.listReposted) || (isLiked && !options.process.listLiked)) {
        return
      }

      // only add container once we know we are processing
      container.classList.add('bfi-container')

      // list highlight option
      if (!options.behavior.highlightLists) {
        container.classList.add('no-highlight')
      }
    }
    return
  }

  // pass 2: identify notifications elements
  list = link.closest(`.bfi-list`)
  if (list) {
    // get container
    const container = link.closest('.bfi-container')
    if (!container) {
      return
    }

    // if we can't yet see the hide list button, the list is closed
    const hideList = container.querySelector(`[aria-label="${aria.listHide}"]`)
    if (!hideList) {
      return
    }

    // notification list
    return {
      handle,
      type: 'list',
      element: link,
      target: link,
      avatar: getAvatar(link),
      list
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // feed
  // -------------------------------------------------------------------------------------------------------------------

  // feed item avatar (ignore!)
  if (link.getAttribute('aria-label')?.includes(aria.avatar)) {
    return
  }

  // feed item link
  element = link.closest(`[data-testid="feedItem-by-${handle}"]`)
  if (element && options.process.feedFollowed) {
    const label = element.getAttribute('aria-label') // only likes and follows get a label; replies don't
    if (label) {
      if (label?.includes(aria.feedFollowed)) {
        return {
          handle,
          type: `feed`,
          element,
          target: link.parentElement,
          avatar: getAvatar(element)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// create elements
// ---------------------------------------------------------------------------------------------------------------------

function makeEmoji (icon, title) {
  return `<span class="bfi-emoji" title="${title}">${icon}</span>`
}

function makeEmojis (data) {
  const { description, followingCount, followersCount, postsCount, following } = data
  return {
    profile: description
      ? makeEmoji(options.icons.profile, 'User has profile description')
      : '',
    posts: postsCount >= options.thresholds.engaged
      ? makeEmoji(options.icons.engaged, 'User is engaged')
      : postsCount > options.thresholds.posted
        ? makeEmoji(options.icons.posted, 'User has posted')
        : '',
    followers: followersCount > followingCount
      ? makeEmoji(options.icons.popular, 'User is popular')
      : '',
    following: following
      ? makeEmoji(options.icons.following, 'You are following this user')
      : ''
  }
}

function makeInfo (icon, text, count, sep) {
  return `${icon} <span class="bfi-dim">${text}: ${format(count)}${sep ? ' | ' : ''}</span>`
}

const icons = {
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>`,
  chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>`,
  ellipsis: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>`,
  xMark: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,
  minus: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" /></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`
}

/**
 * Build target elements
 *
 * @param {ContentModel} model
 */
function buildElements (model) {
  // variables
  const { type, target, element, handle, avatar, list } = model
  let parent

  // add debug classes
  element.classList.add('bfi-element')
  target.classList.add('bfi-target')
  avatar?.classList.add('bfi-avatar')

  // content
  const content = document.createElement('div')
  content.className = 'bfi-content'
  content.dataset['handle'] = handle

  // elements
  if (type === 'feed') {
    content.style.marginTop = '5px'
    parent = target
  }

  else if (type === 'list') {
    // elements
    const [avatar, title] = target.childNodes
    const wrapper = document.createElement('div')
    wrapper.classList.add('bfi-wrapper')
    title.classList.add('bfi-title')

    // state
    element.dataset.bfiVisible = String(Number(!!options.behavior.expandProfiles))

    // re-layout components
    target.insertBefore(wrapper, title)
    wrapper.appendChild(title)
    parent = wrapper

    // insert toggle button
    const toggle = document.createElement('button')
    toggle.classList.add('bfi-toggle')
    element.appendChild(toggle)

    // insert emojis container
    const emojis = document.createElement('span')
    emojis.classList.add('bfi-emojis')
    title.firstChild.appendChild(emojis)

    // hack! the element's container slides open; so we need to reset its height when opened
    list.style.height = ''
    setTimeout(() => {
      list.style.height = 'auto'
    }, 200)
  }

  else if (type === 'starter') {
    parent = target.parentElement
    target.style.display = 'none'
  }

  else {
    return
  }

  // append element
  parent.appendChild(content)

  // update target
  model.content = content

  // return
  return model
}

/**
 * Render info
 *
 * @param   {HTMLElement}   content
 * @param   {Profile}       profile
 */
function renderContent (content, profile) {
  if (profile.data) {
    // variables
    let { description, followingCount, followersCount, postsCount, following } = profile.data

    // styling variables
    const descriptionClass = profile.isOld
      ? 'bfi-dim'
      : 'bfi-text'

    // if we have a description...
    description = description?.trim()
    if (description) {
      // options
      const emojis = options.profile.emojis

      // condense it
      description = description
        .replaceAll(/(https?:\/\/)(www\.)?(\S+)/g, (_, a, b, c) => `<span class="bfi-url">${emojis ? '⚡️ ' : ''}${c.replace(/\/$/, '')}</span>`) // domain prefixes
        .split(/[|❯•∙⋅\n\r]+/g) // break on pipes, bullets, linebreaks
        .map(line => line.replace(/^- /g, ' ').trim()) // remove dash bullets
        .map(line => options.profile.emojis ? line : stripEmojis(line).trim()) // remove emojis
        .filter(line => line.length > 0) // trim empty lines
        .map(line => `<span class="${descriptionClass}">${line}</span>`) // format text
        .join(` <span class="bfi-sep">|</span> `) // join
    }

    // html parts
    const labels = getLang('en').labels
    const emojis = makeEmojis(profile.data)
    const info = [
      makeInfo(emojis.posts, labels.posts, postsCount, true),
      makeInfo(emojis.followers, labels.followers, followersCount, true),
      makeInfo(emojis.following, labels.following, followingCount)
    ]

    // final html
    const htmlDescription = `<div class="bfi-desc ${options.profile.compact ? 'is-compact' : ''}">${description}</div>`
    const htmlInfo = `<div class="bfi-info">${info.join('')}</div>`

    // set html
    content.innerHTML = description
      ? htmlDescription + '\n\n' + htmlInfo
      : htmlInfo

    // toggle
    const element = content.closest('.bfi-element')
    const toggle = element.querySelector('.bfi-toggle')
    if (toggle) {
      // update function
      const updateToggle = () => {
        // state
        const visible = profile.visible
        toggle.setAttribute('title', visible ? 'Hide' : 'Show')
        element.dataset.bfiVisible = String(Number(visible))

        // emojis
        const emojis = makeEmojis(profile.data)
        element.querySelector('.bfi-emojis').innerHTML = !visible
          ? [emojis.profile, emojis.posts, emojis.followers, emojis.following].join(' ')
          : ''

        // toggle
        toggle.innerHTML = visible
          ? icons.minus
          : icons.plus
      }

      // update immediately
      updateToggle()

      // update on click
      if (!toggle.dataset.bfiToggle) {
        // ensure added only once
        toggle.dataset.bfiToggle = '1'

        // click handler
        toggle.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopImmediatePropagation()
          const visible = profile.visible // element.dataset.bfiVisible === '1'
          void profile.show(!visible)
          updateToggle()
        })
      }
    }
  }
  else {
    content.innerHTML = 'Could not load profile!'
    content.classList.add('bfi-error')
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Process profile links when they become visible
 *
 * @param   {HTMLLinkElement} link
 */
async function onProfileLinkRevealed (link) {
  // test element
  const model = getContentModel(link)

  // don't reprocess
  link.setAttribute('data-bfi', '1')

  // add content
  if (model) {
    if (buildElements(model)) {
      // variables
      const { content, handle } = model

      // create profile class
      const profile = Profile.get(handle)

      // load from cache
      await profile.load()
      const firstLoad = !profile.created
      if (profile.data) {
        renderContent(content, profile)
      }

      // possibly refresh
      if (!profile.data || profile.isStale) {
        // fetch new data
        await profile.fetch()
        if (profile.data) {
          // if first load, and already following, minimise
          if (firstLoad && profile.data.following) {
            profile.visible = false
          }

          // save updated data
          void profile.save()
          renderContent(content, profile)
        }
      }
    }
  }
}

/**
 * Process buttons when they are rendered
 *
 * @param {HTMLButtonElement} button
 * @param {string}            handle
 */
async function onFollowButtonRendered (button, handle) {
  const label = button.getAttribute('aria-label')
  if (label) {
    const { follow, following } = getLang().aria
    const action = label === following
      ? 'follow'
      : label === follow
        ? 'unfollow'
        : null

    // we got a follow / unfollow
    if (action) {
      const profile = Profile.get(handle)
      await profile.load()
      await profile.fetch()
      if (profile.data) {
        // update followers count (need to fake this, as the API won't have updated between the click and the fetch)
        profile.data.followersCount += (
          action === 'follow'
            ? profile.data.following
              ? 0
              : 1
            : -1
        )

        // update following
        profile.data.following = action === 'follow'

        // save profile
        await profile.save()

        // update content
        const sections = document.querySelectorAll(`.bfi-content[data-handle="${handle}"]`)
        sections.forEach(section => {
          renderContent(section, profile)
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// observe dom
// ---------------------------------------------------------------------------------------------------------------------

function observeProfileLinks (process) {
  // create an intersection observer to detect when elements are in view
  const observeVisibility = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        void process(entry.target)
        // stop observing once processed
        observeVisibility.unobserve(entry.target)
      }
    })
  }, {
    rootMargin: '100px 0px', // 100px above and below viewport
    threshold: 0
  })

  // target unprocessed profile links
  const selector = 'a[href^="/profile/"]:not([data-bfi])'

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

function observeFollowButtons (process) {
  // create a mutation observer to watch for button state changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.matches('button[aria-label]')) {
        const button = mutation.target
        const profileLink = button.parentElement.querySelector('a[href^="/profile/"]')

        if (profileLink) {
          // find the handle (@username) in the profile card
          const handle = profileLink.getAttribute('href').split('/').pop()
          if (handle) {
            process(button, handle)
          }
        }
      }
    })
  })

  // configure the observer to watch for attribute changes on buttons
  const observerConfig = {
    attributes: true,
    subtree: true,
    attributeFilter: ['aria-label']
  }

  // start observing the document
  observer.observe(document.body, observerConfig)
}

// ---------------------------------------------------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------------------------------------------------

const options = {}

async function setupOptions () {
  const result = await chrome.runtime.sendMessage({ type: 'GET_OPTIONS' })
  if (result) {
    Object.assign(options, result)
    log(options)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------------------------------------------------

async function start () {
  const result = await Api.init()
  if (result) {
    await Storage.init()
    await setupOptions()
    observeProfileLinks(onProfileLinkRevealed)
    observeFollowButtons(onFollowButtonRendered)
  }
  else {
    setTimeout(start, 1000)
  }
}

void start()
