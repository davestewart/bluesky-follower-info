function setFormValues(options) {
  function setValue(id, value) {
    const element = document.getElementById(id)
    if (!element) return
    if (element.type === 'checkbox') {
      element.checked = value
    } else {
      element.value = value
    }
  }

  Object.entries(options).forEach(([section, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      const id = `${section}-${key}`
      setValue(id, value)
    })
  })
}

function getFormValues() {
  function getValue(id) {
    const element = document.getElementById(id)
    if (!element) return null
    if (element.type === 'checkbox') {
      return element.checked
    } else if (element.type === 'number') {
      return Number(element.value)
    } else {
      return element.value
    }
  }

  const newOptions = {}

  Object.entries(options).forEach(([section, values]) => {
    newOptions[section] = {}
    Object.keys(values).forEach(key => {
      const id = `${section}-${key}`
      const value = getValue(id)
      if (value !== null) {
        newOptions[section][key] = value
      }
    })
  })

  return newOptions
}

const options = await chrome.runtime.sendMessage({ type: 'GET_OPTIONS' })

setFormValues(options)

document.body.addEventListener('change', () => {
  const options = getFormValues()
  void chrome.runtime.sendMessage({ type: 'SET_OPTIONS', options })
})
