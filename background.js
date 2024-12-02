import { loadOptions, saveOptions } from './options/options.js'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_OPTIONS') {
    loadOptions().then(sendResponse)
    return true
  }

  if (message.type === 'SET_OPTIONS') {
    void saveOptions(message.options)
    return false
  }

  if (message.type === 'GET_API') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: () => {
        try {
          return JSON.parse(localStorage.getItem('BSKY_STORAGE'))
        }
        catch {
          return null
        }
      }
    }).then(response => {
      const data = response[0].result
      if (data) {
        const account = data.session?.currentAccount
        if (account) {
          const url = account.pdsUrl
          const token = account.accessJwt
          const result = { url, token }
          sendResponse(result)
          console.log('API Info:', result)
        }
        else {
          console.log('Invalid page local storage data')
        }
      }
      else {
        console.log('Unable to read page local storage')
        sendResponse({})
      }
    })
    return true
  }
})
