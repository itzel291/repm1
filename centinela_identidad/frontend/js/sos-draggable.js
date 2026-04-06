(() => {
  const buttons = Array.from(document.querySelectorAll("button.sos-pulse[onclick*='panico.html']"))

  buttons.forEach((button) => {
    button.style.touchAction = 'none'

    let dragging = false
    let moved = false
    let pointerId = null
    let startX = 0
    let startY = 0
    let initialLeft = 0
    let initialTop = 0

    const onPointerMove = (event) => {
      if (!dragging) return

      const nextLeft = initialLeft + (event.clientX - startX)
      const nextTop = initialTop + (event.clientY - startY)
      const maxLeft = Math.max(window.innerWidth - button.offsetWidth, 0)
      const maxTop = Math.max(window.innerHeight - button.offsetHeight, 0)

      if (Math.abs(event.clientX - startX) > 4 || Math.abs(event.clientY - startY) > 4) {
        moved = true
      }

      button.style.left = `${Math.min(Math.max(nextLeft, 0), maxLeft)}px`
      button.style.top = `${Math.min(Math.max(nextTop, 0), maxTop)}px`
      button.style.right = 'auto'
      button.style.bottom = 'auto'
    }

    const stopDragging = () => {
      if (!dragging) return

      dragging = false
      button.releasePointerCapture?.(pointerId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }

    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return

      const rect = button.getBoundingClientRect()
      dragging = true
      moved = false
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      initialLeft = rect.left
      initialTop = rect.top

      button.style.left = `${rect.left}px`
      button.style.top = `${rect.top}px`
      button.style.right = 'auto'
      button.style.bottom = 'auto'

      button.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', stopDragging)
      window.addEventListener('pointercancel', stopDragging)
    })

    button.addEventListener('click', (event) => {
      if (!moved) return
      event.preventDefault()
      event.stopPropagation()
      moved = false
    }, true)
  })
})()
