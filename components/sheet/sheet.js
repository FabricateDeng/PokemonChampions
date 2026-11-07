// Bottom sheet for filters, long pickers and secondary menus (R7.7).
// Content is provided by the page through the default slot.
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    // When true the panel closes on "完成" only — selections already applied.
    doneText: {
      type: String,
      value: '完成'
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    noop() {}
  }
})
