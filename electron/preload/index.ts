import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('drawDown', {
  platform: process.platform,
})

function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (![...parent.children].includes(child)) parent.appendChild(child)
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if ([...parent.children].includes(child)) parent.removeChild(child)
  },
}

function useLoading() {
  const style = document.createElement('style')
  style.id = 'draw-down-loading-style'
  style.textContent = `
    .dd-loading {
      position: fixed; inset: 0; z-index: 50;
      display: grid; place-items: center;
      background: #0b1210; color: #f3e6c8;
      font-family: "Archivo Black", Impact, sans-serif;
      letter-spacing: 0.08em;
    }
    .dd-loading span {
      animation: dd-pulse 1.2s ease-in-out infinite;
    }
    @keyframes dd-pulse {
      0%, 100% { opacity: 0.45; transform: scale(0.98); }
      50% { opacity: 1; transform: scale(1); }
    }
  `
  const wrap = document.createElement('div')
  wrap.className = 'dd-loading'
  wrap.innerHTML = '<span>DRAW DOWN</span>'

  return {
    appendLoading() {
      safeDOM.append(document.head, style)
      safeDOM.append(document.body, wrap)
    },
    removeLoading() {
      safeDOM.remove(document.head, style)
      safeDOM.remove(document.body, wrap)
    },
  }
}

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)
window.onmessage = (ev) => {
  if (ev.data?.payload === 'removeLoading') removeLoading()
}
setTimeout(removeLoading, 4000)
