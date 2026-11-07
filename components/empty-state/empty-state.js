Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    icon: {
      type: String,
      value: 'ball' // ball | search | plus | star
    },
    title: {
      type: String,
      value: ''
    },
    desc: {
      type: String,
      value: ''
    },
    // Empty string hides the action button (R7.9).
    actionText: {
      type: String,
      value: ''
    }
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
