Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // [{ key, label, badge? }, ...] — 2 to 4 segments (R7.5)
    items: {
      type: Array,
      value: []
    },
    active: {
      type: String,
      value: ''
    }
  },

  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key
      if (!key || key === this.data.active) return
      this.triggerEvent('change', { key })
    }
  }
})
