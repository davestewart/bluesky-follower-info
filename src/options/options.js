export const defaults = {
  process: {
    listHighlight: true,
    listFollowed: true,
    listReposted: true,
    listLiked: true,
    feedFollowed: true,
  },
  profile: {
    emojis: true,
    compact: true,
  },
  icons: {
    posted: '📝',
    engaged: '✅',
    popular: '🔥',
    following: '👍',
  },
  thresholds: {
    posted: 5,
    engaged: 25,
    updated: 7,
    created: 14,
  },
}

export async function loadOptions () {
  const { options } = await chrome.storage.local.get({ options: clone(defaults) })
  return mergeOptions(clone(defaults), options)
}

export async function saveOptions (options) {
  return chrome.storage.local.set({ options })
}

function mergeOptions (baseOptions, newOptions) {
  Object.keys(newOptions).forEach((group) => {
    if (!baseOptions[group]) {
      baseOptions[group] = {}
    }
    Object.keys(newOptions[group]).forEach((key) => {
      baseOptions[group][key] = newOptions[group][key]
    })
  })
  return baseOptions
}

function clone (value) {
  return value !== undefined
    ? JSON.parse(JSON.stringify(value))
    : value
}
