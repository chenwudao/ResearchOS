window.__ModuleLoader__.load({
  id: 'labweave-research-workspace',
  factory: require => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    function splitLead(text) {
      const s = String(text || '').trim()
      const idx = s.search(/\r?\n|(?<=[。！？.?!])\s+/)
      if (idx > 0 && idx <= 56) return [s.slice(0, idx).replace(/^[•\-\d.\s]+/, ''), s.slice(idx).trim()]
      if (s.length <= 44) return [s, '']
      const cut = s.lastIndexOf(' ', 44)
      const point = cut > 16 ? cut : 40
      return [s.slice(0, point) + '…', s]
    }
    function entryHeadlineBody(item) {
      const title = String(item?.title || '').trim()
      if (title) return [title, String(item?.text || '').trim()]
      return splitLead(item?.text)
    }
    const isValidEntryImageSrc = src => {
      if (typeof src !== 'string') return false
      const s = src.trim()
      return /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(s) || /^https?:\/\//i.test(s)
    }
    function entryImageSrc(item) {
      if (!item) return null
      if (isValidEntryImageSrc(item.image)) return item.image.trim()
      if (isValidEntryImageSrc(item.imageUrl)) return item.imageUrl.trim()
      return null
    }
    function EntryImage({ src, alt, className = '' }) {
      const [broken, setBroken] = React.useState(false)
      React.useEffect(() => { setBroken(false) }, [src])
      if (!src || broken) return null
      const isSvg = /^data:image\/svg\+xml/i.test(src)
      return h('div', { className, 'data-svg': isSvg ? 'true' : 'false' },
        h('img', { src, alt: alt || '配图', loading: 'lazy', onError: () => setBroken(true) }))
    }
    const features = { chat: '聊天', feed: '动态', ideas: '点子', goals: '目标', library: '资源库' }
    const updated = 'labweave:project-updated'
    const manage = 'labweave:manage-plugins'
    const nameChanged = 'labweave:assistant-name-changed'
    const openProfileEvent = 'labweave:open-assistant-profile'
    const profileChanged = 'labweave:assistant-profile-changed'
    const pageKey = 'labweave-project-page'
    const selectionKey = 'labweave.project-page.v2'
    const navEvent = 'labweave:navigate'
    const requestId = () => crypto.randomUUID().replaceAll('-', '')

    const styles = `
      .lw-assigned-list{display:grid;align-content:start;gap:18px}
      .lw-assigned-list section{display:grid;gap:6px}
      .lw-assigned-kind{font-size:var(--lw-ui-sm,13px);color:var(--dsw-alias-label-secondary);font-weight:500}
      .lw-assigned-row{display:grid;gap:4px;padding:8px 0;overflow-wrap:anywhere}
      .lw-assigned-row+.lw-assigned-row{border-top:.5px solid var(--dsw-alias-border-l2)}
      .lw-assigned-row strong{font-weight:550}.lw-assigned-row span,.lw-assigned-row small{color:var(--dsw-alias-label-secondary)}
      .lw-bot-symbols{display:grid;grid-template-columns:repeat(auto-fill,minmax(36px,1fr));gap:4px;margin-top:6px;max-height:162px;overflow-y:auto;padding:2px}
      .lw-bot-symbols button{display:grid;place-items:center}.lw-bot-symbols svg,.lw-avatar-label svg{width:20px;height:20px}
      .lw-avatar-label,.lw-avatar-filter{display:flex;align-items:center;gap:8px}.lw-avatar-filter{margin-top:5px}.lw-avatar-filter select{flex:0 0 5.6em}.lw-avatar-filter input{min-width:0;flex:1}
      .lw-bot-symbols button,.lw-symbol-mark{font-family:"Segoe UI Symbol",sans-serif;text-align:center}
      .lw-bot-symbols button{min-height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;cursor:pointer}
      .lw-dialog .lw-form .lw-bot-symbols button{font:500 18px/1.25 "Segoe UI Symbol",sans-serif}
      .lw-dialog .lw-form .lw-bot-symbols button[aria-pressed=true]{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-secondary,ButtonFace);box-shadow:inset 0 0 0 1.5px currentColor}
      .lw-symbol-mark{display:inline-grid;place-items:center;min-width:1em;line-height:1}
      .lw-bot-keywords{display:flex;gap:5px;flex-wrap:wrap;align-items:center}.lw-bot-keywords span{font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.07));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14));border-radius:999px;padding:2px 8px;overflow-wrap:anywhere}
      body{
        --lw-font-delta:calc(var(--dsh-content-font-size,16px) - 14px);
        --lw-ui-xs:clamp(11px,calc(11px + var(--lw-font-delta) * .65),16px);
        --lw-ui-sm:clamp(12px,calc(12px + var(--lw-font-delta) * .8),18px);
        --lw-ui-base:clamp(13px,calc(13px + var(--lw-font-delta) * .9),20px);
        --lw-ui-body:clamp(14px,var(--dsh-content-font-size,16px),22px);
        --lw-ui-md:clamp(15px,calc(15px + var(--lw-font-delta) * .95),23px);
        --lw-ui-lg:clamp(16px,calc(16px + var(--lw-font-delta)),24px);
      }
      .lw-bar,.lw-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0}
      .lw-more{font:inherit;color:inherit;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;cursor:pointer;padding:6px 8px;text-align:start;width:100%}
      .lw-more:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      .lw-dialog{box-sizing:border-box;width:min(30rem,calc(100vw - 2rem));max-height:85vh;overflow:auto;padding:20px 22px;border:.5px solid var(--dsw-alias-border-l3,#8885);border-radius:var(--dsw-radius-panel,20px);color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas));box-shadow:var(--dsw-elevation-prominent,0 16px 40px rgba(0,0,0,.18));font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-base);line-height:1.5}
      .lw-dialog.lw-dialog-wide{width:min(54rem,calc(100vw - 2rem))}
      .lw-dialog::backdrop{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32));backdrop-filter:var(--dsw-mask-blur,none)}
      .lw-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}
      .lw-dialog-head h2,.lw-dialog h2{margin:0;font-size:var(--lw-ui-lg);line-height:1.4;font-weight:600;min-width:0;overflow-wrap:anywhere}
      .lw-dialog-close,.lw-ap-icon-btn{width:28px;height:28px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-secondary);display:inline-grid;place-items:center;cursor:pointer;transition:background-color .14s ease,color .14s ease}
      .lw-dialog-close:hover,.lw-ap-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary)}
      .lw-dialog-close:focus-visible,.lw-ap-icon-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-dialog-close .lw-icon,.lw-ap-icon-btn .lw-icon{width:14px;height:14px}
      .lw-form{display:grid;gap:12px;min-width:0}
      .lw-form label{display:grid;gap:6px;font-size:var(--lw-ui-base);line-height:1.45;font-weight:500;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-form input,.lw-form textarea,.lw-form select,.lw-input,.lw-textarea,.lw-select,.lw-query input{box-sizing:border-box;width:100%;max-width:100%;min-height:38px;font:inherit;font-size:var(--lw-ui-base);line-height:1.5;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-base,Canvas);border:.5px solid var(--dsw-alias-border-l4,#8886);border-radius:var(--dsw-radius-md,8px);padding:7px 11px;transition:border-color .14s ease,box-shadow .14s ease}
      .lw-form textarea,.lw-textarea{resize:vertical;min-height:84px;line-height:1.55}
      .lw-form input:focus,.lw-form textarea:focus,.lw-form select:focus,.lw-input:focus,.lw-textarea:focus,.lw-select:focus,.lw-query input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#3b82f6)}
      .lw-query input{width:calc(100% - 14px);margin:0 7px 8px;min-height:34px;padding:5px 10px}
      .lw-hint{color:var(--dsw-alias-label-tertiary,GrayText);font-size:var(--lw-ui-sm);line-height:1.45;margin:0}
      .lw-panel [role=alert],.lw-dialog [role=alert],.lw-error{color:var(--dsw-alias-state-error-primary,#b34835);font-size:var(--lw-ui-base);line-height:1.5}
      .lw-mono{font-family:var(--ds-font-family-code,"SF Mono","JetBrains Mono",Consolas,monospace);font-variant-numeric:tabular-nums;text-autospace:no-autospace}
      .lw-num{font-variant-numeric:tabular-nums}

      /* Buttons & Pills aligned with DSH Schedule (monochrome black CTA & pill filters) */
      .lw-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;height:auto;padding:5px 14px;border:0;border-radius:999px;font-family:inherit;font-size:var(--lw-ui-base);line-height:1.4;font-weight:500;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background-color .14s ease,border-color .14s ease,color .14s ease,opacity .14s ease;color:var(--dsw-alias-label-primary,inherit);background:transparent}
      .lw-btn:disabled:not(.lw-btn-primary):not(.lw-btn-accent){opacity:.45;cursor:not-allowed}
      .lw-btn-primary:disabled,.lw-btn-accent:disabled{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff);opacity:.32;cursor:not-allowed}
      .lw-btn:focus-visible,.lw-tree button:focus-visible,.lw-seg-btn:focus-visible,.lw-subtab:focus-visible,.lw-corner-btn:focus-visible,.lw-lib-nav-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-btn-sm{min-height:30px;padding:4px 12px;font-size:var(--lw-ui-sm);line-height:1.4}
      .lw-btn-xs{min-height:26px;padding:2px 10px;font-size:var(--lw-ui-sm);line-height:1.35}
      .lw-btn-primary,.lw-btn-accent{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff)}
      .lw-btn-primary:hover:not(:disabled),.lw-btn-accent:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-label-primary,#0f1115));opacity:.86}
      .lw-btn-secondary{background:var(--dsw-alias-bg-base,Canvas);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));color:var(--dsw-alias-label-primary)}
      .lw-btn-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      .lw-btn-ghost{background:transparent;color:var(--dsw-alias-label-secondary)}
      .lw-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary)}
      .lw-btn-danger{background:transparent;color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1));color:var(--dsw-alias-state-error-primary,#b34835)}

      .lw-tag{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:1px 8px;font-size:var(--lw-ui-xs);line-height:1.45;font-weight:500;white-space:nowrap}
      .lw-tag[data-tone="neutral"],.lw-tag[data-tone="info"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-secondary)}
      .lw-tag[data-tone="outline"]{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));color:var(--dsw-alias-label-tertiary)}
      .lw-tag[data-tone="success"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 11%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-tag[data-tone="warning"]{background:var(--dsw-alias-state-warn-tertiary,color-mix(in srgb,var(--dsw-alias-state-warn-primary,#ca8a04) 13%,transparent));color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary,#ca8a04))}
      .lw-tag[data-tone="danger"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 11%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}

      /* Sidebar tree, fused top brand-assistant entry, flat footer & native DSH typography */
      .lw-tree{padding:8px 0 18px;min-width:0;color:var(--dsw-alias-label-primary,inherit);font-size:var(--lw-ui-base)}
      .lw-tree-head,.lw-row{display:flex;align-items:center;min-width:0;gap:2px}
      .lw-tree-head{padding:0 6px 8px 10px;font-weight:600;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-tree-head span{flex:1}
      .lw-tree button,.lw-footer-bar button,.lw-lib-nav-btn{font-family:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
      .lw-tree button:hover,.lw-tree [aria-current="page"],.lw-footer-bar button:hover,.lw-lib-nav-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-icon{display:inline-block;width:16px;height:16px;flex:none}
      .lw-tree .lw-tool{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:var(--dsw-radius-sm,6px);padding:0;flex:none;color:var(--dsw-alias-label-tertiary)}
      .lw-tree .lw-tool:hover{color:var(--dsw-alias-label-primary)}
      .lw-tree .lw-tool-danger:hover{color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1))}
      .lw-row-tools{display:inline-flex;align-items:center;gap:1px;flex:none;opacity:.55;transition:opacity .12s ease}
      .lw-row:hover .lw-row-tools,.lw-row:focus-within .lw-row-tools,.lw-row:has([aria-current="page"]) .lw-row-tools{opacity:1}
      .lw-row-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1;min-height:calc(32px + max(0px,var(--lw-font-delta) * 1.1));height:auto;border-radius:var(--dsw-radius-md,8px);text-align:start;padding:4px 7px;font-size:inherit;line-height:1.4}
      .lw-row-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-tier{margin:1px 0 5px 14px;padding-inline-start:7px;border-inline-start:.5px solid var(--dsw-alias-border-l3,#8884)}
      .lw-tree .lw-tier .lw-icon{width:15px;height:15px}
      .lw-sessions{margin-inline-start:19px}
      .lw-sessions .lw-row-main{font-size:var(--lw-ui-sm);min-height:calc(28px + max(0px,var(--lw-font-delta)));height:auto;padding-block:3px}
      .lw-sessions .lw-tool{width:21px;height:21px}
      .lw-tree [aria-current="page"]{font-weight:600}
      .lw-tree small{display:block;margin:5px 8px;font-size:var(--lw-ui-sm);line-height:1.45;color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-sidebar-empty-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;margin:4px 0;padding:10px 12px;border:1px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.28))!important;border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.03))!important;color:var(--dsw-alias-label-secondary)!important;font-size:var(--lw-ui-sm);font-weight:500;cursor:pointer;transition:background-color .14s ease,border-color .14s ease,color .14s ease}
      .lw-sidebar-empty-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))!important;border-color:var(--dsw-alias-border-l4)!important;color:var(--dsw-alias-label-primary)!important}
      .lw-brand-entry{display:inline-flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0}
      .lw-wordmark{white-space:nowrap;display:inline-block;font-weight:700;font-size:clamp(24px,calc(24px + var(--lw-font-delta) * .6),28px);line-height:1.1;letter-spacing:-.025em}
      .lw-brand-assistant{margin-left:auto;flex:none;display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));background:var(--dsw-alias-bg-layer-1,rgba(38,49,72,.05));color:var(--dsw-alias-label-secondary);font-size:var(--lw-ui-xs,12px);font-weight:500;line-height:1.45;white-space:nowrap;transition:background-color .14s ease,border-color .14s ease,color .14s ease}
      [class*="logoRow"] button[class*="brand"]:hover .lw-brand-assistant,.lw-brand-assistant[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.09));border-color:var(--dsw-alias-border-l3,rgba(128,128,128,.28));color:var(--dsw-alias-label-primary)}
      .lw-brand-assistant[data-active="true"]{font-weight:600}
      [data-sidebar-collapsed="true"] .lw-brand-assistant,[class*="collapsed"] .lw-brand-assistant{display:none}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"]:has(.lw-wordmark){gap:8px;align-items:center}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="brandIdentity"]:has(.lw-wordmark){flex:1 1 auto;min-width:0;height:auto!important;gap:12px;align-items:center;overflow:visible}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="brandName"]:has(.lw-wordmark){flex:1 1 auto;min-width:0;height:auto!important;display:flex;align-items:center;overflow:visible}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"] [class*="brandIdentity"]:has(.lw-wordmark) .lw-brand-mark{width:34px!important;height:34px!important}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"] button[class*="brand"]:has(.lw-wordmark){flex:1 1 auto;min-width:0;height:auto!important;justify-content:flex-start;border-radius:var(--dsw-radius-md,10px);padding:7px 8px 7px 6px;margin-left:-4px;overflow:visible;transition:background-color .14s ease}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"] button[class*="brand"]:has(.lw-wordmark):hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      [class*="logoRow"] + [class*="newSession"],[data-sidebar-drawer] [class*="newSession"]{display:none!important}
      .lw-brand-mark{display:block;flex:none;object-fit:contain}
      [class*="panelList"] [class*="moreAnchor"],[class*="panelList"] [class*="panelUnpin"],[data-lw-hidden="1"]{display:none!important}
      [data-shortcut-modal="settings"] [data-slot="settings.action"],[data-shortcut-modal="settings"] [data-slot="settings.general.item"]>*:has([aria-label*="Session Log"]){display:none!important}
      [data-sidebar-drawer]:not([data-sidebar-collapsed="true"]) [class*="panelList"] button{font-size:var(--lw-ui-base);min-height:calc(32px + max(0px,var(--lw-font-delta) * 1.1));height:auto}
      [data-shortcut-modal="settings"] [class*="navCell"]{font-size:var(--lw-ui-base)}
      [data-shortcut-modal="settings"] [class*="rowText"] [class*="title"]{font-size:var(--lw-ui-body);line-height:1.45}
      [data-shortcut-modal="settings"] [class*="rowText"] [class*="desc"],[data-shortcut-modal="settings"] [class*="rowText"] [class*="description"]{font-size:var(--lw-ui-sm);line-height:1.45}
      .lw-footer-bar{display:flex;flex-direction:column;align-items:stretch;gap:2px;width:100%;min-width:0;padding-top:6px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18))}
      .lw-footer-bar[data-collapsed="true"]{align-items:flex-start;width:36px;padding-top:4px;border-top:0}
      .lw-footer-btn{width:100%;min-width:0;min-height:calc(32px + max(0px,var(--lw-font-delta) * 1.1));height:auto;padding:4px 9px;border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-secondary);font-size:var(--lw-ui-base);line-height:1.4;font-weight:500;display:flex;align-items:center;justify-content:flex-start;gap:9px;white-space:nowrap}
      .lw-footer-btn:hover{color:var(--dsw-alias-label-primary)}
      .lw-footer-bar[data-collapsed="true"] .lw-footer-btn{width:36px;min-height:36px;height:36px;padding:0;justify-content:center}
      .lw-footer-btn span{overflow:hidden;text-overflow:ellipsis}
      .lw-rail{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:4px 0 8px;margin:0;width:36px}
      .lw-rail-btn{width:36px;height:36px;min-height:36px;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-secondary);display:inline-grid;place-items:center;cursor:pointer;transition:background-color .14s ease,color .14s ease}
      .lw-rail-btn:hover,.lw-rail-btn[aria-expanded="true"],.lw-rail-btn[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13));color:var(--dsw-alias-label-primary)}
      .lw-rail-popover{position:fixed;left:60px;z-index:95;width:276px;max-width:calc(100vw - 74px);max-height:min(76vh,540px);overflow:auto;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base)));box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,none);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:var(--lw-ui-base);display:grid;gap:6px}
      .lw-rail-popover button{font-family:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
      .lw-rail-popover button:hover,.lw-rail-popover [aria-current="page"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-rail-popover .lw-tool{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:var(--dsw-radius-md,8px);padding:0;flex:none;color:var(--dsw-alias-label-secondary);transition:background-color .14s ease,color .14s ease}
      .lw-rail-popover .lw-tool .lw-icon,.lw-session-popover .lw-tool .lw-icon{width:14px;height:14px}
      .lw-rail-popover .lw-tool:hover{color:var(--dsw-alias-label-primary)}
      .lw-rail-popover .lw-tool:focus-visible,.lw-session-popover .lw-tool:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-rail-popover .lw-tier{margin:0;padding-inline-start:0;border-inline-start:0}
      .lw-rail-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .lw-rail-popover-head strong{font-size:var(--lw-ui-base);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}

      /* Top-Left Global Sessions & Top-Right Corner Direct Right-Sidebar Toggle */
      .lw-corner-wrap{position:relative;display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0;max-width:100%;-webkit-app-region:no-drag}
      .lw-corner-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:var(--lw-ui-sm);line-height:1.35;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .14s ease,color .14s ease,border-color .14s ease}
      .lw-corner-btn:hover,.lw-corner-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-corner-btn .lw-icon{width:14px;height:14px}
      .lw-session-popover{position:fixed;z-index:96;width:308px;max-width:calc(100vw - 24px);max-height:min(68vh,460px);display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px;padding:10px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas)));box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,none);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-base)}
      .lw-session-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .lw-session-popover-head strong{font-size:var(--lw-ui-sm);font-weight:600;color:var(--dsw-alias-label-secondary)}
      .lw-session-popover-list{display:grid;gap:2px;overflow:auto;min-height:0;padding-right:2px}
      .lw-session-popover button{font-family:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
      .lw-session-popover button:hover,.lw-session-popover [aria-current="page"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-session-popover [aria-current="page"]{font-weight:600}
      .lw-session-popover .lw-row-main{padding:6px 8px;min-height:34px;justify-content:space-between;gap:8px}
      .lw-session-popover .lw-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-session-popover .lw-row-time{flex:none;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
      .lw-session-popover .lw-tool{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:var(--dsw-radius-md,8px);padding:0;flex:none;color:var(--dsw-alias-label-secondary);transition:background-color .14s ease,color .14s ease}
      .lw-session-popover .lw-tool:hover{color:var(--dsw-alias-label-primary)}
      .lw-session-popover .lw-tool-danger:hover{color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1))}
      .lw-rpane{box-sizing:border-box;height:100%;overflow:auto;padding:16px 18px 28px;display:grid;align-content:start;gap:14px;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-primary)}
      .lw-rpane-card{padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);display:grid;gap:8px}
      .lw-rpane-card h3{margin:0;font-size:var(--lw-ui-base);font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px}

      /* Right Sidebar Links & Clean Hero Chrome */
      .lw-hero-ctx-btn{border:0;background:transparent;padding:2px 6px;border-radius:6px;font:inherit;font-size:var(--lw-ui-sm);line-height:1.45;color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:start;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-hero-ctx-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      [data-conversation-content]{container-type:inline-size;container-name:lwchat}
      [data-content-phase="hero"] [class*="heroWorkspaceRow"]>:first-child{display:none}
      [data-conversation-content] [class*="previewBadge"]:empty{display:none}

      /* Global Assistant Hero Entry (Stacked Avatar + Name, Enlarged & Elevated) */
      [data-content-phase="hero"] [class*="scrollBody"]:has(.lw-hero-profile-entry){justify-content:flex-start!important;padding-top:clamp(22px,8.5vh,84px)}
      [data-content-phase="hero"] [class*="composerHero"]:has(.lw-hero-profile-entry){gap:clamp(16px,3.8vh,36px)}
      [data-content-phase="hero"] [class*="headline"]:has(.lw-hero-profile-entry) [class*="titleGroup"]{display:none!important}
      .lw-hero-profile-entry{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:14px 28px 12px;border:0;border-radius:24px;corner-shape:round;background:transparent;color:inherit;font-family:inherit;cursor:pointer;text-align:center;transition:background-color .16s ease,transform .16s ease}
      .lw-hero-profile-entry:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.07))}
      .lw-hero-profile-entry:active{transform:scale(.99)}
      .lw-hero-profile-entry:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:4px}
      .lw-hero-avatar-frame{position:relative;width:92px;height:92px;border-radius:50%;corner-shape:round;display:grid;place-items:center;flex:none;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));box-shadow:0 6px 22px rgba(0,0,0,.06);transition:box-shadow .18s ease,border-color .18s ease,transform .18s ease}
      .lw-hero-profile-entry:hover .lw-hero-avatar-frame{border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.35));box-shadow:0 10px 28px rgba(0,0,0,.1);transform:translateY(-1px)}
      .lw-hero-avatar-frame[data-custom="false"] .lw-hero-avatar-img{width:68px;height:68px;object-fit:contain}
      .lw-hero-avatar-frame[data-custom="true"] .lw-hero-avatar-img{width:90px;height:90px;border-radius:50%;corner-shape:round;object-fit:cover}
      .lw-hero-avatar-badge{position:absolute;right:0;bottom:0;width:26px;height:26px;border-radius:50%;corner-shape:round;display:grid;place-items:center;background:var(--dsw-alias-bg-base,Canvas);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));box-shadow:0 2px 8px rgba(0,0,0,.12);color:var(--dsw-alias-label-secondary);opacity:.85;transition:opacity .15s ease,color .15s ease,transform .15s ease}
      .lw-hero-avatar-badge .lw-icon{width:13px;height:13px}
      .lw-hero-profile-entry:hover .lw-hero-avatar-badge{opacity:1;color:var(--dsw-alias-label-primary);transform:scale(1.06)}
      .lw-hero-entry-name{font-size:clamp(28px,calc(28px + var(--lw-font-delta) * .85),36px);line-height:1.22;font-weight:600;letter-spacing:-.02em;color:var(--dsw-alias-label-primary);max-width:min(520px,80vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-hero-entry-tagline{font-size:var(--lw-ui-sm);line-height:1.45;font-weight:400;color:var(--dsw-alias-label-tertiary);max-width:min(460px,78vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-height:620px){
        [data-content-phase="hero"] [class*="scrollBody"]:has(.lw-hero-profile-entry){padding-top:16px}
        .lw-hero-avatar-frame{width:76px;height:76px}
        .lw-hero-avatar-frame[data-custom="false"] .lw-hero-avatar-img{width:56px;height:56px}
        .lw-hero-avatar-frame[data-custom="true"] .lw-hero-avatar-img{width:74px;height:74px}
      }

      /* Assistant Profile & Settings Modal (Image 2 Inspired) */
      .lw-ap-dialog{box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:min(88vh,760px);overflow:auto;padding:18px 22px 24px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:24px;corner-shape:round;color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-base,Canvas);box-shadow:var(--dsw-elevation-prominent,0 20px 48px rgba(0,0,0,.22));font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-base);line-height:1.5}
      .lw-ap-dialog::backdrop{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32));backdrop-filter:var(--dsw-mask-blur,none)}
      .lw-ap-dialog *{box-sizing:border-box}
      .lw-ap-dialog .lw-ap-tabs{background:color-mix(in srgb,var(--dsw-alias-label-primary,CanvasText) 6%,var(--dsw-alias-bg-base,Canvas))}
      .lw-assistant-ledger{min-height:270px;color:var(--dsw-alias-label-primary);padding:0 4px 16px}
      .lw-hist-group{margin:10px 0 20px}.lw-hist-group summary{list-style:none;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-weight:550;padding:6px 0}.lw-hist-group summary::-webkit-details-marker{display:none}
      .lw-hist-group:not([open])>summary svg{transform:rotate(-90deg)}
      .lw-hist-row{display:flex;align-items:flex-start;gap:10px;margin:15px 0;overflow-wrap:anywhere}
      .lw-hist-icon{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary,CanvasText) 5%,var(--dsw-alias-bg-base,Canvas));color:var(--dsw-alias-label-secondary)}
      .lw-hist-row>div{min-width:0}.lw-hist-title{font-weight:500}.lw-hist-muted{display:block;color:var(--dsw-alias-label-secondary);font-size:var(--lw-ui-sm)}
      .lw-hist-all{display:block;margin:14px auto 4px;padding:5px 14px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
      .lw-hist-empty{display:grid;justify-items:center;gap:3px;padding:28px 0;text-align:center}.lw-hist-empty>svg{width:33px;height:33px;color:var(--dsw-alias-label-secondary)}.lw-hist-empty p{margin:0}
      .lw-ap-topbar{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px}
      .lw-ap-top-title{display:inline-flex;align-items:center;gap:6px;font-size:var(--lw-ui-md);font-weight:600;color:var(--dsw-alias-label-primary)}
      .lw-ap-back-btn{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 10px 0 6px;border:0;border-radius:999px;corner-shape:round;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--lw-ui-sm);font-weight:500;cursor:pointer}
      .lw-ap-back-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-ap-header{display:grid;justify-items:center;text-align:center;gap:6px;margin-top:2px}
      .lw-ap-avatar-box{position:relative;width:96px;height:96px;border-radius:50%;corner-shape:round;display:grid;place-items:center}
      .lw-ap-avatar-circle{width:96px;height:96px;border-radius:50%;corner-shape:round;display:grid;place-items:center;overflow:hidden;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}
      .lw-ap-avatar-circle[data-custom="false"] img{width:68px;height:68px;object-fit:contain}
      .lw-ap-avatar-circle[data-custom="true"] img{width:96px;height:96px;border-radius:50%;corner-shape:round;object-fit:cover}
      .lw-ap-avatar-edit{position:absolute;right:0;bottom:0;width:30px;height:30px;border-radius:50%;corner-shape:round;display:grid;place-items:center;background:var(--dsw-alias-bg-base,Canvas);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));box-shadow:0 3px 10px rgba(0,0,0,.14);color:var(--dsw-alias-label-primary);cursor:pointer;overflow:hidden;transition:transform .14s ease,background-color .14s ease}
      .lw-ap-avatar-edit:hover{transform:scale(1.06);background:var(--dsw-alias-bg-layer-1)}
      .lw-ap-avatar-edit .lw-icon{width:14px;height:14px}
      .lw-ap-avatar-edit input[type="file"]{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
      .lw-ap-name{margin:6px 0 0;font-size:clamp(20px,calc(20px + var(--lw-font-delta) * .5),24px);font-weight:600;line-height:1.25;letter-spacing:-.015em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-ap-status{display:inline-flex;align-items:center;gap:6px;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-secondary)}
      .lw-ap-bolt{width:16px;height:16px;border-radius:50%;corner-shape:round;background:#16a34a;color:#fff;display:inline-grid;place-items:center;flex:none}
      .lw-ap-bolt[data-tone="error"]{background:var(--dsw-alias-state-error-primary,#dc2626)}
      .lw-ap-bolt[data-tone="loading"]{background:var(--dsw-alias-label-tertiary,#94a3b8)}
      .lw-ap-reset-avatar{border:0;background:transparent;padding:2px 8px;border-radius:999px;corner-shape:round;font:inherit;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-tertiary);cursor:pointer}
      .lw-ap-reset-avatar:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-ap-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;margin:16px 0 14px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12))}
      .lw-ap-tab{height:34px;border:0;border-radius:999px;corner-shape:round;background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-grid;place-items:center;cursor:pointer;transition:background-color .15s ease,color .15s ease,box-shadow .15s ease}
      .lw-ap-tab:hover{color:var(--dsw-alias-label-primary)}
      .lw-ap-tab[aria-selected="true"]{background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary);box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .lw-ap-card{border-radius:18px;corner-shape:round;padding:16px 18px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12));display:grid;gap:6px}
      .lw-ap-card-name{font-size:var(--lw-ui-md);font-weight:600;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
      .lw-ap-card-sub{font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-tertiary);line-height:1.5;overflow-wrap:anywhere}
      .lw-ap-card-label{margin-top:10px;font-size:var(--lw-ui-xs);font-weight:500;color:var(--dsw-alias-label-tertiary)}
      .lw-ap-card-body{font-size:var(--lw-ui-base);line-height:1.65;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-ap-edit-pill{width:100%;margin-top:12px;height:40px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13));color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--lw-ui-base);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:background-color .14s ease}
      .lw-ap-edit-pill:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 12%,transparent)}
      .lw-ap-edit-pill .lw-icon{width:15px;height:15px}
      .lw-ap-cards-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
      .lw-ap-grad-card{position:relative;min-height:112px;padding:15px 16px 14px;border:0;border-radius:18px;corner-shape:round;color:#fff;font-family:inherit;text-align:start;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;gap:14px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.14);transition:transform .16s ease,box-shadow .16s ease}
      .lw-ap-grad-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.2)}
      .lw-ap-grad-soul{background:radial-gradient(120% 110% at 85% 90%,rgba(255,105,135,.32),transparent 58%),linear-gradient(140deg,#b91c3a 0%,#9e1930 52%,#5c0d23 100%)}
      .lw-ap-grad-memory{background:radial-gradient(120% 110% at 25% 15%,rgba(96,165,250,.32),transparent 58%),linear-gradient(140deg,#1e3a8a 0%,#2448c8 55%,#1a1868 100%)}
      .lw-ap-grad-title{display:block;font-size:var(--lw-ui-md);font-weight:700;line-height:1.3;letter-spacing:-.01em}
      .lw-ap-grad-sub{display:block;margin-top:2px;font-size:var(--lw-ui-xs);color:rgba(255,255,255,.78);line-height:1.4}
      .lw-ap-grad-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:var(--lw-ui-xs);color:rgba(255,255,255,.88);font-variant-numeric:tabular-nums}
      .lw-ap-mem-list{display:grid;gap:8px;max-height:290px;overflow:auto;padding-right:2px}
      .lw-ap-mem-item{padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.05));border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));display:grid;gap:6px}
      .lw-ap-mem-item[data-pinned="true"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 38%,var(--dsw-alias-border-l2,rgba(128,128,128,.16)))}
      .lw-ap-mem-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
      .lw-ap-mem-search{display:flex;align-items:center;gap:6px}
      .lw-ap-mem-search input{min-width:0;flex:1}
      .lw-mo-root{display:flex;flex-direction:column;gap:2px;min-height:0;outline:none}
      .lw-mo-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.18));flex:none}
      .lw-mo-cell{box-sizing:border-box;border-radius:var(--dsw-radius-md,8px);width:100%;min-height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:transparent;border:none;outline:none;align-items:center;gap:6px;padding:4px 8px;font:inherit;font-size:13px;line-height:20px;display:flex}
      .lw-mo-cell:hover:not(:disabled),.lw-mo-cell:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      .lw-mo-cell:disabled{opacity:.48;cursor:default}
      .lw-mo-cell-label{white-space:nowrap;flex:none}
      .lw-mo-cell-val{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:1;overflow:hidden;font-size:12px}
      .lw-mo-cell .lw-icon{width:12px;height:12px;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-tertiary));flex:none}
      .lw-mo-sub{display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto;padding-top:2px}
      .lw-mo-subhead{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 4px 4px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16))}
      .lw-mo-back{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;padding:3px 6px;cursor:pointer}
      .lw-mo-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-mo-back .lw-icon{width:13px;height:13px}
      .lw-mo-group-label{padding:4px 8px 2px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary)}
      .lw-mo-opt{box-sizing:border-box;width:100%;min-height:32px;padding:4px 8px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer}
      .lw-mo-opt:hover:not(:disabled),.lw-mo-opt:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .lw-mo-opt:disabled{opacity:.48;cursor:default}
      .lw-mo-opt-main{display:flex;flex-direction:column;min-width:0;flex:1}
      .lw-mo-opt-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-mo-opt-sub{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-mo-pills{display:flex;flex-wrap:wrap;gap:4px;padding:2px 8px 6px}
      .lw-mo-pill{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.24));border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:2px 8px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-mo-pill:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-mo-pill[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary);font-weight:500}
      .lw-mo-custom{display:flex;align-items:center;gap:6px;padding:4px 6px 2px}
      .lw-mo-custom input{flex:1;min-width:0;height:28px;border-radius:var(--dsw-radius-sm,6px);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 8px}
      .lw-mo-custom input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#3b82f6)}
      .lw-mo-err{padding:4px 8px;font-size:11px;color:var(--dsw-alias-state-error-primary,#dc2626)}
      @media(max-width:360px){.lw-ap-cards-grid{grid-template-columns:minmax(0,1fr)}}

      /* Main Research Stage (Muse Editorial Stream + DSH Monochrome Typography & Black CTAs) */
      .lw-page{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;container-type:inline-size;container-name:lwpage;background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-body);line-height:1.6;-webkit-font-smoothing:antialiased;text-autospace:normal}
      .lw-page *{box-sizing:border-box}
      .lw-page-inner{width:100%;max-width:780px;margin:0 auto;padding:28px clamp(18px,4vw,48px) 64px;min-width:0}
      .lw-page[data-feature="library"] .lw-page-inner,.lw-page[data-feature="goals"] .lw-page-inner:has(.lw-board-scroll),.lw-page[data-feature="ideas"] .lw-page-inner{max-width:1080px}
      .lw-page-head{display:grid;gap:8px;margin-bottom:22px}
      .lw-head-top{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .lw-head-title{min-width:0;display:grid;gap:2px}
      .lw-page h1.lw-crumbs{margin:0;display:grid;gap:2px;min-width:0}
      .lw-crumb-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:var(--lw-ui-sm);line-height:1.35;font-weight:400;color:var(--dsw-alias-label-tertiary)}
      .lw-crumb-parent{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-crumb-sep{opacity:.55;user-select:none}
      .lw-crumb-current{font-size:clamp(24px,calc(24px + var(--lw-font-delta) * .85),30px);line-height:1.22;font-weight:700;letter-spacing:-.025em;color:var(--dsw-alias-label-primary)}
      .lw-head-desc{margin:2px 0 0;font-size:var(--lw-ui-base);line-height:1.55;color:var(--dsw-alias-label-tertiary);max-width:68ch}

      /* Monochrome Filter Pills & Subtabs (DSH Schedule _filterTab aesthetic) */
      .lw-segmented{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;max-width:100%}
      .lw-seg-btn{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:var(--lw-ui-base);line-height:1.4;font-weight:400;cursor:pointer;white-space:nowrap;transition:color .14s ease,background-color .14s ease}
      .lw-seg-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-seg-btn[aria-selected="true"],.lw-seg-btn[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);font-weight:500}
      .lw-seg-count{font-size:var(--lw-ui-xs);line-height:1.4;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
      .lw-subtabs{display:flex;align-items:center;gap:6px;width:100%;margin-bottom:2px}
      .lw-subtab{position:relative;min-height:30px;padding:0 12px;border:0;border-radius:999px;background:transparent;font-family:inherit;font-size:var(--lw-ui-base);line-height:1.45;font-weight:400;color:var(--dsw-alias-label-tertiary);cursor:pointer;white-space:nowrap;transition:color .14s ease,background-color .14s ease}
      .lw-subtab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-subtab[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);font-weight:500}
      .lw-notice{display:inline-flex;align-items:center;gap:6px;width:fit-content;margin:0;padding:4px 11px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 10%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a);font-size:var(--lw-ui-sm);line-height:1.45;font-weight:500}

      /* Airy Hairline Containers & Muse Composers */
      .lw-panel{display:grid;gap:16px;min-width:0;overflow-wrap:anywhere}
      .lw-card{background:var(--dsw-alias-bg-base,Canvas);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:14px;padding:16px;min-width:0}
      .lw-card-sub{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));border-radius:10px;padding:11px 13px;min-width:0}
      .lw-entry-shell{display:grid;gap:10px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));border-radius:14px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.03))}
      .lw-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .lw-card-title{margin:0;font-size:var(--lw-ui-md);line-height:1.45;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
      .lw-drawer{margin-bottom:18px}
      .lw-empty{padding:48px 20px;text-align:center;border:0;border-radius:14px;background:transparent}
      .lw-empty strong{display:block;font-size:var(--lw-ui-md);font-weight:500;color:var(--dsw-alias-label-primary);margin-bottom:6px}
      .lw-empty p{margin:0 0 14px;font-size:var(--lw-ui-base);color:var(--dsw-alias-label-tertiary)}

      /* Inline Entry / Console Forms */
      .lw-entry-bar{display:flex;align-items:end;gap:8px;flex-wrap:wrap}
      .lw-entry-bar label:not(.lw-btn){flex:1 1 240px}
      .lw-filter-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .lw-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .lw-pill{min-height:29px;padding:0 11px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:var(--lw-ui-sm);line-height:1.4;font-weight:400;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:all .14s ease}
      .lw-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .lw-pill[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);font-weight:500}

      /* Chats List */
      .lw-chats{list-style:none;margin:0;padding:0;display:grid;gap:8px}
      .lw-chat-card{width:100%;display:flex;align-items:center;gap:12px;padding:13px 16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;text-align:start;cursor:pointer;transition:background-color .14s ease,border-color .14s ease}
      .lw-chat-card:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
      .lw-chat-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--lw-ui-body);line-height:1.45;font-weight:500}
      .lw-chat-card time{font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}

      /* Muse Feed Timeline & Open Editorial Ideas Stream */
      .lw-list-reset{list-style:none;margin:0;padding:0}
      .lw-stream{display:grid;gap:0}
      .lw-stream-item{display:grid;grid-template-columns:32px minmax(0,1fr);gap:14px;padding:18px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .lw-stream-item:last-child{border-bottom:0}
      .lw-avatar-badge{width:30px;height:30px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);display:grid;place-items:center;margin-top:2px}
      .lw-stream-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:5px}
      .lw-stream-title{font-size:var(--lw-ui-body);line-height:1.45;font-weight:600;color:var(--dsw-alias-label-primary);text-decoration:none}
      a.lw-stream-title:hover{text-decoration:underline;text-underline-offset:3px}
      .lw-stream-body{font-size:var(--lw-ui-base);line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-stream-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}

      .lw-ideas-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(250px,.95fr);gap:24px;align-items:start}
      .lw-muse-sec{display:grid;gap:4px}
      .lw-muse-sec-title{margin:10px 0 4px;font-size:var(--lw-ui-base);line-height:1.4;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px}
      .lw-muse-row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:14px;align-items:start;padding:13px 8px;margin-inline:-8px;border-radius:12px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14));transition:background-color .14s ease}
      .lw-muse-row:last-child{border-bottom:0}
      .lw-muse-row:hover{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04))}
      .lw-muse-row-main{min-width:0;display:grid;gap:3px}
      .lw-muse-row-title{font-size:var(--lw-ui-body);line-height:1.45;font-weight:600;color:var(--dsw-alias-label-primary)}
      .lw-muse-row-sub{font-size:var(--lw-ui-sm);line-height:1.55;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-muse-row-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}
      .lw-item-link{color:var(--dsw-alias-label-primary);font-weight:500;text-decoration:underline;text-decoration-color:var(--dsw-alias-border-l4);text-underline-offset:3px}
      .lw-item-link:hover{text-decoration-color:var(--dsw-alias-label-primary)}

      /* Muse Goals Checklist + Timeline + Workflows */
      .lw-status-group{display:flex;align-items:center;gap:8px;margin:8px 0 6px;font-size:var(--lw-ui-base);font-weight:600;color:var(--dsw-alias-label-primary)}
      .lw-status-dot{width:8px;height:8px;border-radius:999px;background:var(--dsw-alias-label-tertiary)}
      .lw-status-dot[data-tone="active"]{background:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.16)}
      .lw-status-group[data-tone="active"]{color:#15803d}
      .lw-goal-list{display:grid;gap:2px}
      .lw-goal-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:12px;padding:12px 8px;margin-inline:-8px;border-radius:12px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14));transition:background-color .14s ease}
      .lw-goal-card:last-child{border-bottom:0}
      .lw-goal-card:hover{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04))}
      .lw-goal-card[data-done="true"]{opacity:.62}
      .lw-goal-card[data-done="true"] .lw-goal-text{text-decoration:line-through;color:var(--dsw-alias-label-secondary)}
      .lw-checkbox{width:17px;height:17px;margin:4px 0 0;border-radius:4px;accent-color:var(--dsw-alias-label-primary,#0f1115);cursor:pointer}
      .lw-goal-text{font-size:var(--lw-ui-body);line-height:1.5;font-weight:500;color:var(--dsw-alias-label-primary)}
      .lw-goal-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-tertiary)}

      /* Topological Timeline Board */
      .lw-board-scroll{overflow-x:auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
      .lw-board{position:relative;display:flex;width:max-content;min-width:100%;align-items:flex-start;gap:44px;padding:22px 18px}
      .lw-board-col{width:190px;flex:0 0 auto;display:grid;gap:10px;position:relative;z-index:1}
      .lw-board-node{padding:10px 12px;border:.5px solid var(--dsw-alias-border-l3);border-inline-start:3px solid var(--dsw-alias-label-primary,#0f1115);border-radius:10px;background:var(--dsw-alias-bg-base);font-size:var(--lw-ui-base);line-height:1.45}
      .lw-board-node[data-done="true"]{border-inline-start-color:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-board-edges{position:absolute;inset:0 auto auto 0;pointer-events:none}

      /* Research State & Experiment Workflows */
      .lw-state-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px}
      .lw-state-cell{padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
      .lw-state-cell small{display:block;font-size:var(--lw-ui-xs);line-height:1.4;font-weight:600;color:var(--dsw-alias-label-tertiary);margin-bottom:4px}
      .lw-state-cell p{margin:0;font-size:var(--lw-ui-base);line-height:1.5;color:var(--dsw-alias-label-primary);white-space:pre-wrap}
      .lw-stepper{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
      .lw-step-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:var(--lw-ui-sm);line-height:1.4;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .lw-step-pill[data-state="SUCCEEDED"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 11%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-step-pill[data-state="RUNNING"]{background:var(--dsw-alias-label-primary,#0f1115);color:var(--dsw-alias-label-primary-foreground,#fff)}
      .lw-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,175px),1fr));gap:8px;margin:10px 0}
      .lw-kpi{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2)}
      .lw-kpi small{display:block;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-tertiary);margin-bottom:2px}
      .lw-kpi strong{display:block;font-size:var(--lw-ui-base);font-weight:600;color:var(--dsw-alias-label-primary)}
      .lw-banner{padding:12px 14px;border-radius:12px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-warn-label,#ca8a04) 28%,transparent);background:var(--dsw-alias-state-warn-tertiary,rgba(202,138,4,.09));display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:10px 0}
      .lw-banner[data-tone="info"]{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}
      .lw-table-wrap{max-width:100%;overflow-x:auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base)}
      .lw-table{width:100%;border-collapse:collapse;font-size:var(--lw-ui-base);line-height:1.45;text-align:left}
      .lw-table th{padding:9px 12px;font-weight:600;color:var(--dsw-alias-label-secondary);border-bottom:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);white-space:nowrap}
      .lw-table td{padding:8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);vertical-align:top}
      .lw-table tr:last-child td{border-bottom:0}
      .lw-code{margin:8px 0 0;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);font-family:var(--ds-font-family-code,monospace);font-size:var(--dsh-code-font-size,13px);line-height:1.55;white-space:pre-wrap;overflow:auto;max-height:280px}

      /* Muse Document Library Gallery + Left Category Rail + On-Demand Reader Split */
      .lw-lib-shell{display:grid;grid-template-columns:168px minmax(0,1fr);gap:24px;align-items:start}
      .lw-lib-nav{display:grid;gap:4px;position:sticky;top:16px}
      .lw-lib-nav-group{font-size:var(--lw-ui-xs);font-weight:600;color:var(--dsw-alias-label-tertiary);padding:8px 10px 4px;margin-top:4px}
      .lw-lib-nav-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:6px 10px;border-radius:8px;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-secondary);text-align:start}
      .lw-lib-nav-btn[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);font-weight:500}
      .lw-lib-split{display:grid;grid-template-columns:minmax(260px,.92fr) minmax(0,1.08fr);gap:18px;align-items:start}
      .lw-doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));gap:14px}
      .lw-doc-card{display:flex;flex-direction:column;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);overflow:hidden;transition:border-color .14s ease,box-shadow .14s ease,transform .14s ease}
      .lw-doc-card:hover{border-color:var(--dsw-alias-border-l4);box-shadow:0 6px 20px rgba(0,0,0,.05)}
      .lw-doc-card[data-active="true"]{border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.38));box-shadow:0 0 0 1px var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04))}
      .lw-doc-thumb{height:112px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border-bottom:.5px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;position:relative}
      .lw-doc-thumb[data-has-image="true"]{padding:0;background:var(--dsw-alias-bg-layer-2,#f8fafc)}
      .lw-doc-thumb-media{width:100%;height:100%;display:grid;place-items:center}
      .lw-doc-thumb-media[data-svg="true"]{background:#f8fafc}
      .lw-doc-thumb-media img{width:100%;height:100%;object-fit:cover;display:block}
      .lw-doc-thumb-media[data-svg="true"] img{object-fit:contain;padding:6px;box-sizing:border-box}
      .lw-doc-preview-title{font-size:11px;line-height:1.4;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .lw-doc-preview-lines{display:grid;gap:5px;margin-top:6px;opacity:.55}
      .lw-doc-preview-lines span{display:block;height:4px;border-radius:2px;background:var(--dsw-alias-border-l4,rgba(128,128,128,.35))}
      .lw-doc-body{padding:11px 12px 12px;display:grid;gap:8px}
      .lw-doc-title-row{display:flex;align-items:flex-start;gap:8px;min-width:0}
      .lw-doc-title{font-size:var(--lw-ui-sm);line-height:1.35;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
      .lw-doc-foot{display:flex;align-items:center;justify-content:space-between;gap:6px}
      .lw-res-dot{width:7px;height:7px;border-radius:999px;flex:none;background:var(--dsw-static-neutral-bluish-300,#94a3b8)}
      .lw-res-dot[data-kind="pdf"]{background:var(--dsw-alias-label-primary,#0f1115)}
      .lw-res-dot[data-kind="repository"]{background:var(--dsw-alias-label-secondary,#475569)}
      .lw-res-dot[data-kind="output"]{background:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-res-dot[data-kind="link"]{background:var(--dsw-alias-label-tertiary,#64748b)}
      .lw-reader-pane{border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);overflow:hidden;min-width:0;position:sticky;top:16px}
      .lw-reader-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:11px 14px;border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
      .lw-reader-body{margin:0;padding:16px 18px;max-height:60vh;overflow:auto;font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-body);line-height:1.7;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-file-btn{position:relative;overflow:hidden}
      .lw-file-btn input[type="file"]{position:absolute;inset:0;width:1px;height:1px;opacity:0;pointer-events:none}
      .lw-map-lanes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .lw-map-lane{padding:10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);display:grid;gap:6px;align-content:start}
      .lw-map-lane-btn{text-align:start;border:0;background:transparent;padding:4px 6px;border-radius:6px;font:inherit;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-primary);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-map-lane-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}

      /* Non-Assistant Page Topbar Companion Toggle [◫], Unified Feature Bot Layout & Split Workspace [|] */
      .lw-page{display:flex;flex-direction:column;overflow:hidden}
      .lw-page-topbar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 16px;min-height:46px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));background:var(--dsw-alias-bg-base,Canvas);z-index:8}
      [data-sidebar-collapsed="true"] .lw-page-topbar{padding-left:54px}
      [data-sidebar-collapsed="true"] .lw-split-host .lw-page-topbar,[data-sidebar-collapsed="true"] .lw-split-grid>.lw-page+.lw-page .lw-page-topbar{padding-left:16px}
      .lw-companion-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:999px;corner-shape:round;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:var(--lw-ui-sm);font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .14s ease,color .14s ease,border-color .14s ease}
      .lw-companion-btn:hover,.lw-companion-btn[aria-pressed="true"],.lw-companion-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-companion-btn .lw-icon{width:14px;height:14px}
      .lw-pane-close{width:30px;height:30px;padding:0;border-radius:999px;corner-shape:round;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-secondary);display:inline-grid;place-items:center;flex:none;cursor:pointer;transition:background-color .14s ease,color .14s ease,border-color .14s ease}
      .lw-pane-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-pane-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-pane-close .lw-icon{width:14px;height:14px}

      .lw-fbot-shell{flex:1;min-height:0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);position:relative;overflow:hidden}
      .lw-fbot-main{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%}
      .lw-fbot-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:22px clamp(16px,3.5vw,40px) 20px}
      .lw-fbot-center{width:100%;max-width:820px;margin:0 auto;display:grid;gap:14px;min-width:0}
      .lw-fbot-empty-wrap{min-height:min(46vh,360px);display:grid;place-items:center;padding:24px 12px}
      .lw-fbot-head{display:flex;align-items:center;justify-content:center;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12))}
      .lw-bot-pill{display:inline-flex;align-items:center;justify-content:center;gap:9px;max-width:100%;min-height:40px;padding:5px 14px 5px 7px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.24));border-radius:999px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08)));color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.06);transition:transform .14s ease,border-color .14s ease,background-color .14s ease,box-shadow .14s ease}
      .lw-bot-pill:hover{transform:translateY(-1px);border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.36));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.12));box-shadow:0 4px 16px rgba(0,0,0,.1)}
      .lw-bot-pill:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,#3b82f6);outline-offset:2px}
      .lw-bot-pill-badge,.lw-bot-sheet-avatar{border-radius:999px;flex:none;display:grid;place-items:center;background:#1d9bf0;color:#fff;box-shadow:0 2px 8px rgba(29,155,240,.28)}
      .lw-bot-pill-badge{width:28px;height:28px}
      .lw-bot-pill-badge[data-tone="feed"],.lw-bot-sheet-avatar[data-tone="feed"]{background:#0ea5e9;box-shadow:0 2px 10px rgba(14,165,233,.28)}
      .lw-bot-pill-badge[data-tone="ideas"],.lw-bot-sheet-avatar[data-tone="ideas"]{background:#f59e0b;box-shadow:0 2px 10px rgba(245,158,11,.28)}
      .lw-bot-pill-badge[data-tone="goals"],.lw-bot-sheet-avatar[data-tone="goals"]{background:#10b981;box-shadow:0 2px 10px rgba(16,185,129,.28)}
      .lw-bot-pill-badge[data-tone="library"],.lw-bot-sheet-avatar[data-tone="library"]{background:#8b5cf6;box-shadow:0 2px 10px rgba(139,92,246,.28)}
      .lw-bot-pill-badge .lw-icon,.lw-bot-pill-badge svg{width:16px;height:16px}
      .lw-bot-pill-badge .lw-symbol-mark{font-size:15px;line-height:1}
      .lw-bot-pill-name{font-size:var(--lw-ui-md,15px);font-weight:600;line-height:1.25;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-bot-pill-edit{width:18px;height:18px;flex:none;display:inline-grid;place-items:center;color:var(--dsw-alias-label-tertiary);opacity:.55;transition:opacity .14s ease,color .14s ease}
      .lw-bot-pill:hover .lw-bot-pill-edit,.lw-bot-pill:focus-visible .lw-bot-pill-edit{opacity:1;color:var(--dsw-alias-label-primary)}
      .lw-bot-pill-edit .lw-icon{width:13px;height:13px}

      .lw-bot-sheet-backdrop{position:fixed;inset:0;z-index:1200;display:flex;justify-content:flex-end;align-items:stretch;padding:10px;background:rgba(0,0,0,.34);backdrop-filter:blur(2px)}
      .lw-bot-sheet{width:min(368px,calc(100vw - 20px));height:100%;max-height:100%;display:flex;flex-direction:column;border-radius:18px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.24));background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary);box-shadow:-12px 0 36px rgba(0,0,0,.22);overflow:hidden}
      .lw-bot-sheet-head{display:flex;align-items:center;justify-content:flex-end;padding:12px 14px 4px;flex:none}
      .lw-bot-sheet-hero{display:grid;justify-items:center;gap:8px;padding:4px 18px 14px;text-align:center;flex:none}
      .lw-bot-sheet-avatar{width:62px;height:62px}
      .lw-bot-sheet-avatar .lw-icon,.lw-bot-sheet-avatar svg{width:28px;height:28px}
      .lw-bot-sheet-avatar .lw-symbol-mark{font-size:26px;line-height:1}
      .lw-bot-sheet-name{margin:0;font-size:18px;font-weight:700;line-height:1.25;letter-spacing:-.015em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-bot-sheet-pills{display:inline-flex;flex-wrap:wrap;justify-content:center;gap:6px}
      .lw-bot-sheet-pill{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:var(--lw-ui-xs);font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16))}
      .lw-bot-sheet-form{flex:1;min-height:0;display:flex;flex-direction:column}
      .lw-bot-sheet-body{flex:1;min-height:0;overflow:auto;padding:4px 16px 14px;display:grid;align-content:start;gap:12px}
      .lw-bot-sheet-card{padding:12px 14px;border-radius:14px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));display:grid;gap:10px}
      .lw-bot-sheet-card-title{font-size:var(--lw-ui-xs);font-weight:600;color:var(--dsw-alias-label-tertiary)}
      .lw-bot-sheet-kv{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:var(--lw-ui-sm);padding:2px 0}
      .lw-bot-sheet-kv span{color:var(--dsw-alias-label-secondary)}
      .lw-bot-sheet-kv strong,.lw-bot-sheet-kv code{font-weight:500;color:var(--dsw-alias-label-primary)}
      .lw-bot-sheet-foot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14))}

      .lw-empty-emblem{width:54px;height:54px;margin:0 auto 14px;border-radius:16px;display:grid;place-items:center;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.05));border:1px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.25));color:var(--dsw-alias-label-secondary)}
      .lw-empty-emblem .lw-icon{width:24px;height:24px}
      .lw-empty-chips{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:8px}
      .lw-empty-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--lw-ui-sm);font-weight:500;cursor:pointer;transition:background-color .14s ease,color .14s ease,border-color .14s ease,transform .12s ease}
      .lw-empty-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4);transform:translateY(-1px)}
      .lw-empty-chip .lw-icon{width:14px;height:14px}

      .lw-fbot-stats{display:grid;gap:8px;padding:10px 14px;border-radius:14px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.035));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12))}
      .lw-fbot-stats-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .lw-fbot-stat-pills{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-secondary)}
      .lw-stat-chip{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums}
      .lw-stat-dot{width:7px;height:7px;border-radius:999px;flex:none}
      .lw-stat-track{display:flex;gap:2px;height:5px;width:100%;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l1,rgba(128,128,128,.12))}
      .lw-stat-seg{height:100%;min-width:6px;border-radius:999px;transition:width .24s ease}
      .lw-goal-ring-wrap{display:inline-flex;align-items:center;gap:10px}
      .lw-goal-ring{width:34px;height:34px;flex:none;transform:rotate(-90deg)}
      .lw-goal-ring-bg{fill:none;stroke:var(--dsw-alias-border-l2,rgba(128,128,128,.2));stroke-width:3.2}
      .lw-goal-ring-fg{fill:none;stroke:var(--dsw-alias-state-success-primary,#16a34a);stroke-width:3.2;stroke-linecap:round;transition:stroke-dashoffset .25s ease}

      .lw-fbot-detail{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));border-radius:16px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.03));padding:14px 16px;display:grid;gap:12px;min-width:0}
      .lw-fbot-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .lw-fbot-detail-title{margin:0;font-size:var(--lw-ui-lg);font-weight:650;line-height:1.35;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
      .lw-fbot-detail-figure{margin:0;border-radius:12px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05))}
      .lw-fbot-detail-media{width:100%;display:grid;place-items:center;max-height:360px;overflow:hidden}
      .lw-fbot-detail-media[data-svg="true"]{background:#f8fafc}
      .lw-fbot-detail-media img{display:block;width:100%;max-height:360px;object-fit:contain}
      .lw-fbot-detail-media[data-svg="true"] img{padding:10px;box-sizing:border-box}
      .lw-fbot-detail-caption{padding:8px 12px;font-size:var(--lw-ui-xs);line-height:1.45;color:var(--dsw-alias-label-secondary);border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04))}
      .lw-fbot-card{border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));border-radius:14px;padding:11px 14px;background:var(--dsw-alias-bg-base,Canvas);display:flex;align-items:flex-start;gap:12px;cursor:pointer;text-align:start;transition:border-color .14s ease,background-color .14s ease,box-shadow .14s ease}
      .lw-fbot-card:hover{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border-color:var(--dsw-alias-border-l4);box-shadow:0 3px 12px rgba(0,0,0,.04)}
      .lw-fbot-card[data-active="true"]{background:var(--dsw-alias-bg-layer-1,rgba(38,49,72,.05));border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.38));box-shadow:0 0 0 1px var(--dsw-alias-border-l3,rgba(128,128,128,.22))}
      .lw-fbot-card[data-active="true"] .lw-fbot-card-icon{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.09));color:var(--dsw-alias-label-primary)}
      .lw-fbot-card-icon{width:30px;height:30px;border-radius:9px;flex:none;display:grid;place-items:center;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));color:var(--dsw-alias-label-secondary);margin-top:1px}
      .lw-fbot-card-icon .lw-icon{width:15px;height:15px}
      .lw-fbot-card-body{flex:1;min-width:0;display:grid;gap:4px}
      .lw-fbot-card[data-illustrated="true"] .lw-muse-row-sub{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
      .lw-fbot-card-media{flex:none;width:132px;aspect-ratio:16/10;border-radius:10px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));display:grid;place-items:center;align-self:center}
      .lw-fbot-card-media[data-svg="true"]{background:#f8fafc}
      .lw-fbot-card-media img{width:100%;height:100%;object-fit:cover;display:block}
      .lw-fbot-card-media[data-svg="true"] img{object-fit:contain;padding:4px;box-sizing:border-box}

      .lw-bot-turns{display:grid;gap:10px;min-width:0}
      .lw-bot-msg{padding:11px 14px;border-radius:14px;font-size:var(--lw-ui-body);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-bot-msg[data-role="user"]{justify-self:end;max-width:min(86%,640px);background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.07));color:var(--dsw-alias-label-primary)}
      .lw-bot-msg[data-role="assistant"]{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
      .lw-bot-msg-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-tertiary);margin-bottom:4px}

      .lw-fbot-composer-wrap{flex:none;padding:6px clamp(16px,3.5vw,40px) 16px;border-top:0;background:transparent}
      .lw-fbot-composer{position:relative;width:100%;max-width:740px;margin:0 auto;display:flex;align-items:flex-end;gap:6px;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));border-radius:26px;corner-shape:round;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,Canvas));box-shadow:var(--dsw-elevation-card,0 2px 12px rgba(0,0,0,.05));transition:border-color .15s ease,box-shadow .15s ease}
      .lw-fbot-composer:focus-within{border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.4));box-shadow:var(--dsw-elevation-panel,0 4px 16px rgba(0,0,0,.08))}
      .lw-fbot-composer textarea{flex:1;min-width:0;border:0;background:transparent;padding:5px 4px;min-height:32px;max-height:120px;resize:none;font:inherit;font-size:var(--lw-ui-body);line-height:22px;color:var(--dsw-alias-label-primary);align-self:center}
      .lw-fbot-composer textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
      .lw-fbot-composer textarea:focus{outline:none}
      .lw-fbot-plus-btn,.lw-fbot-send-btn{width:32px;height:32px;flex:none;border:0;border-radius:50%;corner-shape:round;display:inline-grid;place-items:center;cursor:pointer;transition:background-color .14s ease,color .14s ease,opacity .14s ease,transform .12s ease}
      .lw-fbot-plus-btn{background:transparent;color:var(--dsw-alias-label-secondary)}
      .lw-fbot-plus-btn:hover,.lw-fbot-plus-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary)}
      .lw-fbot-plus-btn .lw-icon{width:17px;height:17px}
      .lw-fbot-send-btn{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff)}
      .lw-fbot-send-btn:hover:not(:disabled){opacity:.86;transform:scale(1.03)}
      .lw-fbot-send-btn:disabled{opacity:.26;cursor:not-allowed}
      .lw-fbot-send-btn .lw-icon{width:16px;height:16px}
      .lw-fbot-plus-btn:focus-visible,.lw-fbot-send-btn:focus-visible,.lw-empty-chip:focus-visible,.lw-fbot-rename-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-fbot-plus-menu{position:absolute;left:6px;bottom:calc(100% + 8px);z-index:30;min-width:154px;padding:6px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.24));border-radius:14px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas)));box-shadow:var(--dsw-elevation-panel,0 12px 30px rgba(0,0,0,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,none);display:grid;gap:2px}
      .lw-fbot-plus-menu button{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--lw-ui-sm);font-weight:500;text-align:start;cursor:pointer}
      .lw-fbot-plus-menu button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .lw-fbot-plus-menu button .lw-icon{width:15px;height:15px;color:var(--dsw-alias-label-secondary)}

      [class*="centerCol"][data-lw-split="true"]{flex-direction:row!important}
      [class*="centerCol"][data-lw-split="true"]>[class*="mainPanel"]{flex:1 1 0%;min-width:340px}
      .lw-split-host{flex:1 1 0%;min-width:360px;min-height:0;height:100%;display:flex;border-left:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);overflow:hidden}
      .lw-split-grid{flex:1;min-width:0;min-height:0;height:100%;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(340px,1fr);overflow-x:auto}
      .lw-split-grid>.lw-page+.lw-page{border-left:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22))}

      @container lwpage (max-width:760px){
        .lw-fbot-card-media{width:104px}
        .lw-ideas-layout,.lw-lib-shell,.lw-lib-split{grid-template-columns:minmax(0,1fr)}
        .lw-lib-nav{position:static;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .lw-lib-nav-group{display:none}
        .lw-lib-nav-btn{width:auto;border-radius:999px;padding:4px 12px}
        .lw-muse-row{grid-template-columns:30px minmax(0,1fr)}
        .lw-muse-row-actions{grid-column:2 / -1;justify-content:flex-start;margin-top:4px}
        .lw-goal-card{grid-template-columns:auto minmax(0,1fr)}
        .lw-goal-card>.lw-actions{grid-column:2 / -1}
      }
      @media(max-width:960px){
        .lw-ideas-layout,.lw-lib-shell,.lw-lib-split{grid-template-columns:minmax(0,1fr)}
        .lw-lib-nav{position:static;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .lw-lib-nav-group{display:none}
        .lw-lib-nav-btn{width:auto;border-radius:999px;padding:4px 12px}
        .lw-map-lanes{grid-template-columns:repeat(2,minmax(0,1fr))}
        [class*="centerCol"][data-lw-split="true"]{flex-direction:column!important}
        .lw-split-host{min-width:0;border-left:0;border-top:.5px solid var(--dsw-alias-border-l3)}
        .lw-split-grid{grid-auto-flow:row;grid-auto-columns:unset;overflow-y:auto}
        .lw-split-grid>.lw-page+.lw-page{border-left:0;border-top:.5px solid var(--dsw-alias-border-l3)}
      }
      .lw-receipts{display:grid;gap:4px;max-height:32vh;overflow:auto;font-size:var(--lw-ui-sm,13px)}
      .lw-receipt-toggle{width:100%;display:flex;align-items:baseline;gap:12px;justify-content:space-between;background:transparent;color:inherit;border:0;border-bottom:1px solid var(--dsw-alias-border-l3);padding:6px 2px;text-align:start;cursor:pointer}
      .lw-receipt-detail{padding:6px 2px}
      .lw-receipt-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}
      .lw-receipt-detail button,.lw-receipts summary{cursor:pointer}
      @media(max-width:680px){
        .lw-fbot-scroll{padding:16px 12px 20px}
        .lw-fbot-composer-wrap{padding:8px 12px 12px}
        .lw-map-lanes{grid-template-columns:minmax(0,1fr)}
      }
    `

    async function api(route, body, signal) {
      const resp = await fetch('/api/labweave/' + route, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        signal: signal || AbortSignal.timeout(150000),
      })
      const result = await resp.json()
      if (!resp.ok) throw Error(result.error || '操作失败，请重试。')
      return result
    }
    const project = (workspaceId, action, args = {}, signal) => api('workspace-page', { workspaceId, action, args }, signal)

    const projectCache = new Map()
    function useProject(workspaceId, action = 'view') {
      const cacheKey = workspaceId + ':' + action
      const [state, setState] = React.useState(() => projectCache.has(cacheKey) ? { workspaceId, value: projectCache.get(cacheKey) } : {})
      React.useEffect(() => {
        let controller, timer = null
        if (projectCache.has(cacheKey)) setState({ workspaceId, value: projectCache.get(cacheKey) })
        const refresh = () => {
          clearTimeout(timer); timer = null
          controller?.abort()
          controller = new AbortController()
          const signal = controller.signal
          project(workspaceId, action, {}, signal).then(value => {
            projectCache.set(cacheKey, value)
            if (!signal.aborted) setState({ workspaceId, value })
          }).catch(error => {
            if (signal.aborted) return
            const cached = projectCache.get(cacheKey)
            setState(prev => ({ workspaceId, ...(cached ? { value: cached } : (prev?.value ? { value: prev.value } : {})), error: error.message }))
          })
        }
        const scheduleRefresh = () => {
          clearTimeout(timer)
          timer = setTimeout(refresh, 24)
        }
        refresh()
        window.addEventListener(updated, scheduleRefresh)
        window.addEventListener('focus', scheduleRefresh)
        return () => { clearTimeout(timer); controller?.abort(); window.removeEventListener(updated, scheduleRefresh); window.removeEventListener('focus', scheduleRefresh) }
      }, [workspaceId, action, cacheKey])
      return state.workspaceId === workspaceId ? state : (projectCache.has(cacheKey) ? { workspaceId, value: projectCache.get(cacheKey) } : {})
    }

    const fmtDate = iso => {
      if (!iso) return ''
      try { return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) } catch { return '' }
    }
    const fmtDateTime = iso => {
      if (!iso) return ''
      try { return new Date(iso).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
    }
    const fmtDotDate = iso => {
      try {
        const d = iso ? new Date(iso) : new Date()
        if (Number.isNaN(d.getTime())) return ''
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const yy = String(d.getFullYear()).slice(-2)
        return `${mm}.${dd}.${yy}`
      } catch { return '' }
    }
    async function readAvatarFile(file) {
      if (!file) throw Error('未选择图片文件。')
      if (file.size > 10 * 1024 * 1024) throw Error('图片文件过大，请选择 10 MiB 以内的图片。')
      if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type || '')) throw Error('仅支持 PNG、JPEG、WEBP 或 GIF 格式图片。')
      const url = URL.createObjectURL(file)
      try {
        const img = await new Promise((resolve, reject) => {
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = () => reject(Error('无法解析所选图片文件。'))
          el.src = url
        })
        const w = img.naturalWidth || img.width
        const hgt = img.naturalHeight || img.height
        if (!w || !hgt) throw Error('图片尺寸无效。')
        const side = Math.min(w, hgt)
        const sx = Math.floor((w - side) / 2)
        const sy = Math.floor((hgt - side) / 2)
        const target = Math.min(256, Math.max(128, side))
        const canvas = document.createElement('canvas')
        canvas.width = target
        canvas.height = target
        const ctx2d = canvas.getContext('2d')
        ctx2d.drawImage(img, sx, sy, side, side, 0, 0, target, target)
        let dataUrl = canvas.toDataURL('image/png')
        if (dataUrl.length > 1_400_000) dataUrl = canvas.toDataURL('image/webp', 0.9)
        if (dataUrl.length > 1_400_000) dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        return dataUrl
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    const fmtNum = n => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(4)).toString() : String(n ?? '—'))
    const feedKind = item => item.kind || (item.source === 'GitHub' ? 'repository' : item.source === 'Crossref' ? 'paper' : 'news')
    const feedKey = item => item.id || ((item.url || '') + '::' + item.text)

    function Tag({ tone = 'neutral', children }) {
      return h('span', { className: 'lw-tag', 'data-tone': tone }, children)
    }

    function Btn({ variant = 'secondary', size = '', className = '', type = 'button', ...rest }, ...children) {
      const cls = ['lw-btn', variant ? 'lw-btn-' + variant : '', size ? 'lw-btn-' + size : '', className].filter(Boolean).join(' ')
      return h('button', { type, className: cls, ...rest }, ...children)
    }

    function isBackdropClick(event, node) {
      if (!node || event.detail === 0 || event.target !== node) return false
      const rect = node.getBoundingClientRect()
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    }

    function Dialog({ title, close, wide, children }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const node = ref.current
        node.showModal()
        return () => node.close()
      }, [])
      return h('dialog', {
        className: wide ? 'lw-dialog lw-dialog-wide' : 'lw-dialog',
        ref,
        'aria-label': title,
        onCancel: event => { event.preventDefault(); close() },
        onClick: event => { if (isBackdropClick(event, ref.current)) close() },
      },
        h('div', { className: 'lw-dialog-head' },
          h('h2', null, title),
          h('button', {
            type: 'button',
            className: 'lw-dialog-close',
            'aria-label': '关闭' + (title ? ' ' + title : ''),
            title: '关闭',
            onClick: close,
          }, h(Icon, { name: 'close' }))),
        children)
    }

    const BoltBadge = ({ tone = 'ok' }) => h('span', { className: 'lw-ap-bolt', 'data-tone': tone, 'aria-hidden': true },
      h('svg', { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'currentColor' },
        h('path', { d: 'M13 2L4 14h6l-1 8 11-12h-6l-1-8z' })))

    const CardHeartIcon = () => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'rgba(255,255,255,.72)', 'aria-hidden': true },
      h('path', { d: 'M12 20.5s-7-4.5-9-8.8C1.4 8.2 3.8 5 7.2 5c2 0 3.7 1.1 4.8 2.7C13.1 6.1 14.8 5 16.8 5 20.2 5 22.6 8.2 21 11.7c-2 4.3-9 8.8-9 8.8z' }))

    function AssistantLedger({tab,openSchedules}) {
      const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[retry,reload]=React.useReducer(n=>n+1,0)
      React.useEffect(()=>{
        const ctrl=new AbortController()
        let timer
        async function load(){
          try{
            const value=await api('assistant-history',undefined,ctrl.signal)
            if(!ctrl.signal.aborted){setData(value);setError('')}
          }catch(e){if(!ctrl.signal.aborted)setError(e.message)}
          finally{if(!ctrl.signal.aborted)timer=setTimeout(load,20000)}
        }
        load()
        return ()=>{ctrl.abort();clearTimeout(timer)}
      },[retry])
      if(error)return h('div',{role:'alert'},error,' ',Btn({variant:'ghost',onClick:reload},'重试'))
      if(!data)return h('p',{className:'lw-hint',role:'status'},'正在读取记录…')
      const audit=tab==='security', entries=audit?data.approvals:data.activities
      const groups=new Map(),date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'})
      const time=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'})
      for(const entry of entries){
        const key=entry.time==null?'日期未记录':date.format(entry.time)
        if(!groups.has(key))groups.set(key,[])
        groups.get(key).push(entry)
      }
      const line=(key,icon,title,sub,stamp)=>h('div',{key,className:'lw-hist-row'},
        h('span',{className:'lw-hist-icon','aria-hidden':true},h(Icon,{name:icon})),
        h('div',null,h('div',{className:'lw-hist-title'},title),sub&&h('div',{className:'lw-hist-muted'},sub),stamp&&h('time',{className:'lw-hist-muted'},stamp)))
      const group=(id,title,children)=>h('details',{key:id,open:true,className:'lw-hist-group'},
        h('summary',null,title,h(Icon,{name:'down'})),children)
      return h('section',{className:'lw-assistant-ledger',role:'tabpanel','aria-label':audit?'审核':'活动'},
        !audit&&group('scheduled',data.schedules.length+'项预定任务',h(React.Fragment,null,
          data.schedules.map(s=>{
            const at=new Date(s.scheduledAt), when=Number.isFinite(+at)?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(at):''
            const interval=s.interval&&s.interval%60===0?'每'+(s.interval/60)+'分钟':''
            return line(s.id,'calendar',s.title,interval||when,null)
          }),h('button',{type:'button',className:'lw-hist-all',onClick:openSchedules},'查看所有预定任务'))),
        !entries.length&&h('div',{className:'lw-hist-empty'},h(Icon,{name:audit?'shield':'list'}),
          audit&&h('div',null,'审核'),h('p',null,audit?'暂无批准记录':'暂无活动记录')),
        [...groups].map(([day,rows])=>group(day,day,rows.map(r=>line(r.id,audit?'shield':'activity',r.title,
          [r.detail,r.scope,r.status].filter(Boolean).join(' · '),r.time==null?'':time.format(r.time))))))
    }
    const MEM_CATEGORY_LABELS = {
      preference: '偏好', research: '研究', decision: '决策', note: '备忘',
      task_result: '任务结果', confirmed_workflow: '实验确认',
    }
    const MEM_SOURCE_LABELS = {
      manual: '手动', conversation: '对话提取', task_result: '任务', confirmed_workflow: '实验', profile: '人设',
    }

    function MemorySection({
      hint, placeholder, listLabel, emptyText, addCategories,
      memories, busy, error, notice, onAdd, onUpdate, onPin, onDelete, onSearch,
    }) {
      const catKeys = Object.keys(addCategories)
      const [memText, setMemText] = React.useState('')
      const [memCat, setMemCat] = React.useState(catKeys[0] || 'note')
      const [editingMemId, setEditingMemId] = React.useState(null)
      const [editingMemText, setEditingMemText] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [searchState, setSearchState] = React.useState({ active: false, loading: false, items: null, error: '' })
      const searchSeq = React.useRef(0)

      const runSearch = React.useCallback(async q => {
        const seq = ++searchSeq.current
        const clean = q.trim()
        if (!clean || !onSearch) {
          setSearchState({ active: false, loading: false, items: null, error: '' })
          return
        }
        setSearchState(prev => ({ ...prev, active: true, loading: true, error: '' }))
        try {
          const items = await onSearch(clean)
          if (searchSeq.current === seq) setSearchState({ active: true, loading: false, items: items || [], error: '' })
        } catch (err) {
          if (searchSeq.current === seq) setSearchState({ active: true, loading: false, items: null, error: err?.message || '检索失败，请重试。' })
        }
      }, [onSearch])

      React.useEffect(() => {
        if (!query.trim()) {
          ++searchSeq.current
          setSearchState({ active: false, loading: false, items: null, error: '' })
          return
        }
        const timer = setTimeout(() => { void runSearch(query) }, 180)
        return () => clearTimeout(timer)
      }, [query, runSearch])

      React.useEffect(() => {
        if (query.trim()) void runSearch(query)
      }, [memories])

      const displayed = searchState.active && Array.isArray(searchState.items) ? searchState.items : (memories || [])
      const shownError = error || searchState.error

      return h('div', { style: { display: 'grid', gap: 12, marginTop: 10 } },
        h('p', { className: 'lw-hint', style: { margin: 0 } }, hint),
        shownError && h('p', { role: 'alert', className: 'lw-error', style: { margin: 0 } }, shownError),
        notice && h('p', { role: 'status', className: 'lw-notice' }, notice),
        h('form', { className: 'lw-form', onSubmit: async e => {
          e.preventDefault()
          if (!memText.trim() || busy) return
          if (await onAdd(memText.trim(), memCat)) setMemText('')
        } },
          h('textarea', { rows: 2, maxLength: 4000, value: memText, disabled: busy, placeholder,
            onChange: e => setMemText(e.target.value) }),
          h('div', { className: 'lw-actions', style: { justifyContent: 'space-between' } },
            h('select', { className: 'lw-select', style: { width: 'auto', minHeight: 32, padding: '4px 10px' }, value: memCat, disabled: busy,
              'aria-label': '记忆分类', onChange: e => setMemCat(e.target.value) },
              Object.entries(addCategories).map(([k, lbl]) => h('option', { key: k, value: k }, lbl))),
            Btn({ variant: 'primary', size: 'sm', type: 'submit', disabled: busy || !memText.trim() }, '添加记忆'))),
        onSearch && h('div', { className: 'lw-ap-mem-search lw-form' },
          h('input', { type: 'search', 'aria-label': '搜索记忆', placeholder: '检索记忆关键词（支持中文/英文）…',
            value: query, onChange: e => setQuery(e.target.value) }),
          query.trim() && Btn({ variant: 'ghost', size: 'xs', onClick: () => setQuery('') }, '清空')),
        h('div', { className: 'lw-ap-mem-list', 'aria-label': listLabel },
          searchState.loading && !displayed.length
            ? h('p', { className: 'lw-hint', style: { textAlign: 'center', padding: '18px 0' } }, '正在检索…')
            : !displayed.length
              ? h('p', { className: 'lw-hint', style: { textAlign: 'center', padding: '18px 0' } },
                searchState.active ? '没有匹配该关键词的记忆。' : emptyText)
              : displayed.map(m => h('div', { key: m.id, className: 'lw-ap-mem-item', 'data-pinned': m.pinned ? 'true' : 'false' },
                h('div', { className: 'lw-ap-mem-head' },
                  h('div', { className: 'lw-actions' },
                    m.pinned && h(Tag, { tone: 'success' }, '核心置顶'),
                    h(Tag, { tone: 'neutral' }, MEM_CATEGORY_LABELS[m.category] || m.category || '备忘'),
                    m.source && m.source !== 'manual' && h(Tag, { tone: 'outline' }, MEM_SOURCE_LABELS[m.source] || m.source),
                    h('span', { className: 'lw-hint lw-mono' }, fmtDateTime(m.updatedAt || m.created))),
                  h('div', { className: 'lw-actions' },
                    onPin && Btn({ variant: m.pinned ? 'secondary' : 'ghost', size: 'xs', disabled: busy,
                      'aria-pressed': Boolean(m.pinned), onClick: () => onPin(m.id, !m.pinned) }, m.pinned ? '已置顶' : '置顶'),
                    editingMemId !== m.id && Btn({ variant: 'ghost', size: 'xs', disabled: busy,
                      onClick: () => { setEditingMemId(m.id); setEditingMemText(m.content) } }, '编辑'),
                    Btn({ variant: 'danger', size: 'xs', disabled: busy,
                      onClick: () => onDelete(m.id) }, '删除'))),
                editingMemId === m.id ? h('form', { className: 'lw-form', onSubmit: async e => {
                  e.preventDefault()
                  if (!editingMemText.trim()) return
                  if (await onUpdate(m.id, editingMemText.trim())) setEditingMemId(null)
                } },
                  h('textarea', { rows: 2, value: editingMemText, disabled: busy, onChange: e => setEditingMemText(e.target.value) }),
                  h('div', { className: 'lw-actions' },
                    Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy || !editingMemText.trim() }, '保存'),
                    Btn({ variant: 'ghost', size: 'xs', disabled: busy, onClick: () => setEditingMemId(null) }, '取消')))
                  : h('div', { style: { fontSize: 'var(--lw-ui-sm)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, m.content)))))
    }

    function ProjectMemoryDialog({ row, close }) {
      const [memories, setMemories] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [notice, setNotice] = React.useState('')

      const load = React.useCallback(async () => {
        try {
          setErr('')
          const view = await project(row.workspaceId, 'view', {})
          setMemories(view?.memories || [])
        } catch (error) {
          setErr(error?.message || '无法读取项目记忆。')
        }
      }, [row.workspaceId])

      React.useEffect(() => { void load() }, [load])

      const mutate = async (fn, okMsg) => {
        if (busy) return false
        setBusy(true); setErr(''); setNotice('')
        try {
          await fn()
          await load()
          window.dispatchEvent(new Event(updated))
          if (okMsg) setNotice(okMsg)
          return true
        } catch (error) {
          setErr(error?.message || '操作失败，请重试。')
          return false
        } finally {
          setBusy(false)
        }
      }

      return h(Dialog, { title: `${row.name} · 长期记忆`, close },
        memories === null && !err
          ? h('p', { className: 'lw-hint', role: 'status', style: { margin: '12px 0' } }, '正在读取项目记忆…')
          : h(MemorySection, {
              hint: '保存仅属于当前项目的关键决策、约束、实验基线与长期备忘，支持检索与置顶核心记忆。',
              placeholder: '输入要让该项目长期记住的决策、约束或实验结论…',
              listLabel: '项目记忆列表',
              emptyText: '暂无项目记忆，可在上方添加第一条。',
              addCategories: { decision: '决策', research: '研究', preference: '约束', note: '备忘' },
              memories: memories || [],
              busy,
              error: err,
              notice,
              onSearch: query => project(row.workspaceId, 'memory_search', { query }),
              onAdd: (text, category) => mutate(() => project(row.workspaceId, 'memory_write', { text, category }), '已添加项目记忆。'),
              onUpdate: (id, content) => mutate(() => project(row.workspaceId, 'memory_update', { id, content }), '已更新项目记忆。'),
              onPin: (id, pinned) => mutate(() => project(row.workspaceId, 'memory_pin', { id, pinned }), pinned ? '已置顶为核心记忆。' : '已取消置顶。'),
              onDelete: id => mutate(() => project(row.workspaceId, 'memory_delete', { id }), '已删除项目记忆。'),
            }))
    }

    function AssistantProfileModal({ close, refresh, initialRow, openSettings, openSchedules, startGlobalChat }) {
      const ref = React.useRef(null)
      const fileRef = React.useRef(null)
      const [profile, setProfile] = React.useState(null)
      const [status, setStatus] = React.useState('loading')
      const [err, setErr] = React.useState('')
      const [noticeText, setNoticeText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [tab, setTab] = React.useState('overview')
      const [subView, setSubView] = React.useState(null)
      const [editingInfo, setEditingInfo] = React.useState(false)
      const [draft, setDraft] = React.useState({ name: '', tagline: '', persona: '' })
      const [soulDraft, setSoulDraft] = React.useState('')

      const load = React.useCallback(async () => {
        try {
          setErr('')
          const data = await api('assistant-profile')
          setProfile(data)
          setStatus('ready')
        } catch (error) {
          setStatus('error')
          setErr(error.message || '无法读取助手资料，请检查本地服务。')
        }
      }, [])

      React.useEffect(() => {
        const node = ref.current
        node.showModal()
        load()
        const onSync = () => load()
        window.addEventListener(nameChanged, onSync)
        window.addEventListener(profileChanged, onSync)
        return () => {
          window.removeEventListener(nameChanged, onSync)
          window.removeEventListener(profileChanged, onSync)
          node.close()
        }
      }, [load])

      const applyProfile = async (payload, okMsg = '') => {
        if (busy) return null
        setBusy(true); setErr(''); setNoticeText('')
        try {
          const next = await api('assistant-profile', payload)
          setProfile(next)
          setStatus('ready')
          await refresh().catch(() => {})
          window.dispatchEvent(new Event(nameChanged))
          window.dispatchEvent(new Event(profileChanged))
          window.dispatchEvent(new Event(updated))
          if (okMsg) setNoticeText(okMsg)
          return next
        } catch (error) {
          setErr(error.message || '保存失败，请重试。')
          return null
        } finally {
          setBusy(false)
        }
      }

      const pickAvatar = async e => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file || busy) return
        setErr(''); setNoticeText('')
        try {
          const avatar = await readAvatarFile(file)
          await applyProfile({ avatar }, '头像已更新。')
        } catch (error) {
          setErr(error.message || '更换头像失败。')
        }
      }

      const startEditInfo = () => {
        if (!profile) return
        setDraft({ name: profile.name || '', tagline: profile.tagline || '', persona: profile.persona || '' })
        setEditingInfo(true); setErr(''); setNoticeText('')
      }

      const saveInfo = async e => {
        e.preventDefault()
        if (!draft.name.trim()) { setErr('助手名称不能为空。'); return }
        const saved = await applyProfile({
          name: draft.name.trim(),
          tagline: draft.tagline.trim(),
          persona: draft.persona.trim(),
        }, '助手资料已保存。')
        if (saved) setEditingInfo(false)
      }

      const openSoul = () => {
        if (!profile) return
        setSoulDraft(profile.soul || '')
        setSubView('soul'); setErr(''); setNoticeText('')
      }

      const openMemory = () => {
        setSubView('memory'); setErr(''); setNoticeText('')
      }

      const hasCustomAvatar = profile ? Boolean(profile.hasCustomAvatar && profile.avatar)
        : Boolean(initialRow?.hasCustomAvatar && initialRow?.avatar)
      const avatarSrc = hasCustomAvatar ? (profile?.avatar || initialRow?.avatar) : './labweave-orbit.svg'
      const displayName = profile?.name || initialRow?.name || 'Weave'

      return h('dialog', {
        ref, className: 'lw-ap-dialog', 'aria-label': '全局助手设置',
        onCancel: e => { e.preventDefault(); close() },
        onClick: e => { if (isBackdropClick(e, ref.current)) close() },
      },
        h('div', { className: 'lw-ap-topbar' },
          subView ? h('button', { type: 'button', className: 'lw-ap-back-btn', onClick: () => { setSubView(null); setErr(''); setNoticeText('') } },
            h(Icon, { name: 'back' }), h('span', null, subView === 'soul' ? 'SOUL · 核心准则' : '全局记忆'))
            : h('span', null),
          h('button', { type: 'button', className: 'lw-ap-icon-btn', 'aria-label': '关闭助手资料', title: '关闭', onClick: close },
            h(Icon, { name: 'close' }))),

        !subView ? h(React.Fragment, null,
          tab === 'identity' && h('div', { className: 'lw-ap-header' },
            h('div', { className: 'lw-ap-avatar-box' },
              h('div', {
                className: 'lw-ap-avatar-circle',
                'data-custom': hasCustomAvatar ? 'true' : 'false',
                style: { cursor: 'pointer' },
                onClick: () => fileRef.current?.click(),
                title: '点击更换头像',
              }, h('img', { src: avatarSrc, alt: displayName, draggable: false })),
              h('label', { className: 'lw-ap-avatar-edit', title: '更换头像', 'aria-label': '更换头像' },
                h(Icon, { name: 'edit' }),
                h('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', disabled: busy, onChange: pickAvatar }))),
            h('h2', { className: 'lw-ap-name' }, displayName),
            h('div', { className: 'lw-ap-status', role: status === 'error' ? 'alert' : 'status' },
              status === 'ready' ? h(React.Fragment, null, BoltBadge({ tone: 'ok' }), h('span', null, '已连接'))
                : status === 'loading' ? h(React.Fragment, null, BoltBadge({ tone: 'loading' }), h('span', null, '正在读取助手资料…'))
                : h(React.Fragment, null, BoltBadge({ tone: 'error' }), h('span', null, '连接异常'),
                  Btn({ variant: 'ghost', size: 'xs', onClick: load }, '重试'))),
            profile?.hasCustomAvatar && h('button', {
              type: 'button', className: 'lw-ap-reset-avatar', disabled: busy,
              onClick: () => applyProfile({ avatar: '' }, '已恢复默认图标。'),
            }, '恢复默认图标')),

          h('div', { className: 'lw-ap-tabs', role: 'tablist', 'aria-label': '助手资料栏目' },
            [
              ['overview', 'list', '活动'],
              ['security', 'shield', '审核'],
              ['identity', 'fingerprint', '人设与记忆'],
            ].map(([id, icon, label]) => h('button', {
              key: id, type: 'button', role: 'tab', className: 'lw-ap-tab',
              'aria-selected': tab === id, 'aria-label': label, title: label,
              onClick: () => { setTab(id); setEditingInfo(false); setErr(''); setNoticeText('') },
            }, h(Icon, { name: icon })))),

          err && h('p', { role: 'alert', className: 'lw-error', style: { margin: '0 0 10px', textAlign: 'center' } }, err),
          noticeText && h('p', { role: 'status', className: 'lw-notice', style: { margin: '0 auto 10px', display: 'flex', justifyContent: 'center' } }, noticeText),

          tab === 'identity' && profile && h(React.Fragment, null,
            h('section', { className: 'lw-ap-card', 'aria-label': '助手人设资料' },
              !editingInfo ? h(React.Fragment, null,
                h('div', { className: 'lw-ap-card-name' }, profile.name),
                h('div', { className: 'lw-ap-card-sub' }, profile.tagline),
                h('div', { className: 'lw-ap-card-label' }, '风格气质'),
                h('div', { className: 'lw-ap-card-body' }, profile.persona),
                h('button', { type: 'button', className: 'lw-ap-edit-pill', disabled: busy, onClick: startEditInfo },
                  h(Icon, { name: 'edit' }), h('span', null, '编辑')))
                : h('form', { className: 'lw-form', onSubmit: saveInfo },
                  h('label', null, '助手名称',
                    h('input', { required: true, autoFocus: true, maxLength: 80, value: draft.name, disabled: busy,
                      onChange: e => setDraft(prev => ({ ...prev, name: e.target.value })) })),
                  h('label', null, '一句话简介',
                    h('input', { maxLength: 200, value: draft.tagline, disabled: busy, placeholder: '理性、严谨、好奇…',
                      onChange: e => setDraft(prev => ({ ...prev, tagline: e.target.value })) })),
                  h('label', null, '风格气质',
                    h('textarea', { rows: 4, maxLength: 2000, value: draft.persona, disabled: busy,
                      onChange: e => setDraft(prev => ({ ...prev, persona: e.target.value })) })),
                  h('div', { className: 'lw-actions', style: { justifyContent: 'flex-end' } },
                    Btn({ variant: 'ghost', size: 'sm', disabled: busy, onClick: () => setEditingInfo(false) }, '取消'),
                    Btn({ variant: 'primary', size: 'sm', type: 'submit', disabled: busy || !draft.name.trim() }, busy ? '保存中…' : '保存')))),

            h('div', { className: 'lw-ap-cards-grid' },
              h('button', { type: 'button', className: 'lw-ap-grad-card lw-ap-grad-soul', onClick: openSoul },
                h('div', null,
                  h('span', { className: 'lw-ap-grad-title' }, 'SOUL'),
                  h('span', { className: 'lw-ap-grad-sub' }, '核心准则 · 请谨慎修改')),
                h('div', { className: 'lw-ap-grad-foot' },
                  h('span', null, fmtDotDate(profile.soulUpdatedAt)),
                  CardHeartIcon())),
              h('button', { type: 'button', className: 'lw-ap-grad-card lw-ap-grad-memory', onClick: openMemory },
                h('div', null,
                  h('span', { className: 'lw-ap-grad-title' }, '记忆'),
                  h('span', { className: 'lw-ap-grad-sub' }, `跨会话记忆 · ${profile.memories?.length || 0} 条`)),
                h('div', { className: 'lw-ap-grad-foot' },
                  h('span', null, fmtDotDate(profile.memoryUpdatedAt)),
                  CardHeartIcon())))),

          tab !== 'identity' && h(AssistantLedger, {tab, openSchedules:()=>{close();openSchedules?.()}}))

        : subView === 'soul' ? h('form', { className: 'lw-form', style: { marginTop: 10 }, onSubmit: async e => {
          e.preventDefault()
          const saved = await applyProfile({ soul: soulDraft }, 'SOUL 核心准则已保存。')
          if (saved) setSoulDraft(saved.soul)
        } },
          h('p', { className: 'lw-hint' }, 'SOUL 定义了全局助手在科研协作中的核心准则、证据要求与行为边界，会在每次全局对话中作为行为规范生效。'),
          err && h('p', { role: 'alert', className: 'lw-error' }, err),
          noticeText && h('p', { role: 'status', className: 'lw-notice' }, noticeText),
          h('label', null, '核心准则（SOUL）',
            h('textarea', { rows: 9, maxLength: 8000, value: soulDraft, disabled: busy,
              onChange: e => setSoulDraft(e.target.value) })),
          h('div', { className: 'lw-actions', style: { justifyContent: 'space-between' } },
            Btn({ variant: 'ghost', size: 'sm', disabled: busy, onClick: async () => {
              const reset = await applyProfile({ action: 'reset_soul' }, '已恢复默认核心准则。')
              if (reset) setSoulDraft(reset.soul)
            } }, '恢复默认'),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'ghost', size: 'sm', disabled: busy, onClick: () => setSubView(null) }, '返回'),
              Btn({ variant: 'primary', size: 'sm', type: 'submit', disabled: busy }, busy ? '保存中…' : '保存 SOUL'))))

        : h(MemorySection, {
            hint: '记录全局研究偏好、跨项目方法规范与长期备忘，仅保存在本机并作用于全局助手对话。',
            placeholder: '输入要让全局助手长期记住的偏好或备忘…',
            listLabel: '全局记忆列表',
            emptyText: '暂无全局记忆，可在上方添加第一条。',
            addCategories: { preference: '偏好', research: '研究', decision: '决策', note: '备忘' },
            memories: profile?.memories || [],
            busy,
            error: err,
            notice: noticeText,
            onSearch: async query => (await api('assistant-profile', { action: 'memory_search', query }))?.results || [],
            onAdd: async (content, category) => Boolean(await applyProfile({ action: 'memory_add', content, category }, '已添加全局记忆。')),
            onUpdate: async (id, content) => Boolean(await applyProfile({ action: 'memory_update', id, content }, '已更新记忆。')),
            onPin: async (id, pinned) => Boolean(await applyProfile({ action: 'memory_pin', id, pinned }, pinned ? '已置顶为核心记忆。' : '已取消置顶。')),
            onDelete: async id => Boolean(await applyProfile({ action: 'memory_delete', id }, '已删除记忆。')),
          })
      )
    }

    const botSymbols = ['✦','◎','△','◇','✚','☷','⚑','⌘','Σ','λ','∞','✎']
    let avatarCatalog
    function AvatarPicker({value,onChange,allowDefault}) {
      const [groups,setGroups]=React.useState(avatarCatalog || [])
      const [group,setGroup]=React.useState('全部'),[query,setQuery]=React.useState('')
      const [error,setError]=React.useState(false),[attempt,retry]=React.useReducer(n=>n+1,0)
      React.useEffect(()=>{
        if(avatarCatalog){setGroups(avatarCatalog);return}
        const ctrl=new AbortController()
        fetch(new URL('./labweave-bot-avatars.json',document.baseURI),{signal:ctrl.signal}).then(r=>{
          if(!r.ok)throw Error()
          return r.json()
        }).then(g=>{if(!ctrl.signal.aborted){avatarCatalog=g;setGroups(g);setError(false)}})
          .catch(()=>{if(!ctrl.signal.aborted)setError(true)})
        return ()=>ctrl.abort()
      },[attempt])
      const catalog=groups.length?groups:[{name:'经典',items:botSymbols.map(id=>({id,label:id}))}]
      const search=query.trim().toLowerCase()
      const options=catalog.filter(g=>search || group==='全部' || group===g.name).flatMap(g=>
        g.items.filter(i=>(g.name+' '+i.id+' '+i.label).toLowerCase().includes(search)))
      return h('div',{role:'group','aria-label':'符号头像'},
        h('div',{className:'lw-avatar-label'},'符号头像',value&&h(Icon,{name:value})),
        h('div',{className:'lw-avatar-filter'},
          h('select',{'aria-label':'头像分类',value:group,onChange:e=>{setGroup(e.target.value);setQuery('')}},
            ['全部',...catalog.map(g=>g.name)].map(n=>h('option',{key:n,value:n},n))),
          h('input',{'aria-label':'搜索头像',placeholder:'搜索头像，如 显微镜 / microscope',value:query,onChange:e=>setQuery(e.target.value)})),
        h('div',{className:'lw-bot-symbols'},
          allowDefault&&!search&&h('button',{type:'button','aria-label':'默认符号','aria-pressed':!value,onClick:()=>onChange('')},'默认'),
          options.map(({id,label})=>h('button',{type:'button',key:id,title:label,
            'aria-label':botSymbols.includes(id)?'符号 '+id:'头像 '+label,'aria-pressed':id===value,onClick:()=>onChange(id)},h(Icon,{name:id})))),
        !options.length&&h('span',{role:'status',className:'lw-hint'},'没有匹配的头像'),
        error&&h('button',{type:'button',onClick:retry},'重新加载头像库'))
    }
    function FeatureBotFormDialog({
      title,
      subtitle,
      submitLabel,
      busyLabel,
      initialLabel = '',
      initialHint = '',
      initialSymbol = botSymbols[0],
      initialKeywords = [],
      allowDefaultSymbol = false,
      onSubmit,
      onCancel,
    }) {
      const [label, setLabel] = React.useState(initialLabel)
      const [hint, setHint] = React.useState(initialHint)
      const [symbol, setSymbol] = React.useState(initialSymbol)
      const [tags, setTags] = React.useState((initialKeywords || []).join('、'))
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const dismiss = () => { if (!busy) onCancel() }
      async function submit(e) {
        e.preventDefault()
        if (busy || !label.trim()) return
        const keywords = [...new Set(tags.split(/[,，、;；\n]+/).map(w => w.trim()).filter(Boolean))]
        setBusy(true); setError('')
        try {
          await onSubmit({ label: label.trim(), hint: hint.trim(), symbol, keywords })
        } catch (err) {
          setError(err.message)
          setBusy(false)
        }
      }
      return h(Dialog, { title, close: dismiss }, h('form', { className: 'lw-form', onSubmit: submit },
        subtitle && h('p', { className: 'lw-hint', style: { margin: 0 } }, subtitle),
        h(AvatarPicker,{value:symbol,onChange:setSymbol,allowDefault:allowDefaultSymbol}),
        h('label', null, '名字', h('input', { required: true, autoFocus: true, maxLength: 80, value: label, onChange: e => setLabel(e.target.value) })),
        h('label', null, '备注', h('textarea', { rows: 2, maxLength: 200, value: hint, placeholder: '这个 Bot 负责什么？', onChange: e => setHint(e.target.value) })),
        h('label', null, '关键词', h('input', { value: tags, placeholder: '例如：文献、引用、核查', onChange: e => setTags(e.target.value) })),
        error && h('p', { role: 'alert' }, error),
        h('div', { className: 'lw-actions' },
          Btn({ type: 'submit', variant: 'primary', disabled: busy || !label.trim() }, busy ? busyLabel : submitLabel),
          Btn({ type: 'button', variant: 'ghost', disabled: busy, onClick: dismiss }, '取消'))))
    }
    function CreateFeatureBot({ row, close, created }) {
      const [id] = React.useState(requestId)
      return h(FeatureBotFormDialog, {
        title: '创建功能 Bot',
        subtitle: row.name,
        submitLabel: '创建',
        busyLabel: '创建中…',
        initialSymbol: botSymbols[0],
        onSubmit: async ({ label, hint, symbol, keywords }) => {
          const result = await project(row.workspaceId, 'create_feature_bot', { label, hint, symbol, keywords, requestId: id })
          await created(row, result.feature)
        },
        onCancel: close,
      })
    }
    function FeatureBotEditDialog({ workspaceId, projectName, featureId, featMeta, currentLabel, currentHint, onSaved, onCancel }) {
      const isBuiltin = Boolean(featMeta?.builtin)
      const autoCustomHint = `围绕「${currentLabel}」沉淀推送消息与文件资源`
      const initialHint = currentHint === autoCustomHint ? '' : (currentHint || '')
      const initialSymbol = isBuiltin ? (featMeta?.symbol || '') : (featMeta?.symbol || botSymbols[0])
      const [label, setLabel] = React.useState(currentLabel || '')
      const [hint, setHint] = React.useState(initialHint)
      const [symbol, setSymbol] = React.useState(initialSymbol)
      const [tags, setTags] = React.useState((featMeta?.keywords || []).join('、'))
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const dismiss = React.useCallback(() => { if (!busy) onCancel() }, [busy, onCancel])
      React.useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') dismiss() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [dismiss])
      const parsedKeywords = [...new Set(tags.split(/[,，、;；\n]+/).map(w => w.trim()).filter(Boolean))]
      const submit = async e => {
        e.preventDefault()
        if (busy || !label.trim()) return
        setBusy(true); setError('')
        try {
          const result = await project(workspaceId, 'feature_update', {
            featureId, label: label.trim(), hint: hint.trim(), symbol, keywords: parsedKeywords,
          })
          await onSaved?.(result)
          window.dispatchEvent(new Event(updated))
          onCancel()
        } catch (err) {
          setError(err.message)
          setBusy(false)
        }
      }
      const badgeSymbol = symbol || featureIcon(featureId)
      return ReactDOM.createPortal(
        h('div', {
          className: 'lw-bot-sheet-backdrop',
          onClick: e => { if (e.target === e.currentTarget) dismiss() },
        },
          h('aside', {
            className: 'lw-bot-sheet',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '修改功能 Bot 信息',
          },
            h('div', { className: 'lw-bot-sheet-head' },
              h('button', {
                type: 'button',
                className: 'lw-dialog-close',
                'aria-label': '关闭功能 Bot 信息',
                title: '关闭',
                disabled: busy,
                onClick: dismiss,
              }, h(Icon, { name: 'close' }))),
            h('div', { className: 'lw-bot-sheet-hero' },
              h('span', { className: 'lw-bot-sheet-avatar', 'data-tone': featureId, 'aria-hidden': true },
                h(Icon, { name: badgeSymbol })),
              h('h2', { className: 'lw-bot-sheet-name' }, label.trim() || currentLabel || featureId),
              h('div', { className: 'lw-bot-sheet-pills' },
                projectName && h('span', { className: 'lw-bot-sheet-pill' }, projectName),
                parsedKeywords.slice(0, 3).map(k => h('span', { key: k, className: 'lw-bot-sheet-pill' }, k)))),
            h('form', { className: 'lw-bot-sheet-form', onSubmit: submit },
              h('div', { className: 'lw-bot-sheet-body lw-form' },
                h('div', { className: 'lw-bot-sheet-card' },
                  h('span', { className: 'lw-bot-sheet-card-title' }, '外观与名称'),
                  h(AvatarPicker, { value: symbol, onChange: setSymbol, allowDefault: isBuiltin }),
                  h('label', null, '名字',
                    h('input', { required: true, autoFocus: true, maxLength: 80, value: label, disabled: busy, onChange: e => setLabel(e.target.value) }))),
                h('div', { className: 'lw-bot-sheet-card' },
                  h('span', { className: 'lw-bot-sheet-card-title' }, '职责与关键词'),
                  h('label', null, '备注',
                    h('textarea', { rows: 2, maxLength: 200, value: hint, disabled: busy, placeholder: '这个 Bot 负责什么？', onChange: e => setHint(e.target.value) })),
                  h('label', null, '关键词',
                    h('input', { value: tags, disabled: busy, placeholder: '例如：文献、引用、核查', onChange: e => setTags(e.target.value) }))),
                h('div', { className: 'lw-bot-sheet-card' },
                  h('span', { className: 'lw-bot-sheet-card-title' }, '运行配置'),
                  h('div', { className: 'lw-bot-sheet-kv' }, h('span', null, '所属项目'), h('strong', null, projectName || '当前项目')),
                  h('div', { className: 'lw-bot-sheet-kv' }, h('span', null, '功能标识'), h('code', { className: 'lw-mono' }, featureId)),
                  h('div', { className: 'lw-bot-sheet-kv' }, h('span', null, '模型配置'), h('strong', null, '继承 Weave 默认设置'))),
                error && h('p', { role: 'alert', style: { margin: 0 } }, error)),
              h('div', { className: 'lw-bot-sheet-foot' },
                Btn({ type: 'button', variant: 'ghost', disabled: busy, onClick: dismiss }, '取消'),
                Btn({ type: 'submit', variant: 'primary', disabled: busy || !label.trim() }, busy ? '保存中…' : '保存'))))),
        document.body)
    }
    function ProjectForm({ busy, onPicked, onCancel, refresh, onCreated }) {
      const [name, setName] = React.useState('')
      const [waiting, setWaiting] = React.useState(false)
      const [error, setError] = React.useState('')
      const [id] = React.useState(requestId)
      const submit = async e => {
        e.preventDefault()
        if (busy || waiting || !name.trim()) return
        setWaiting(true)
        try {
          const row = await api('create', { name, requestId: id })
          await refresh()
          if (onCreated) onCreated(row)
          else onPicked(row.path)
        } catch (err) { setError(err.message); setWaiting(false) }
      }
      const close = () => { if (!busy && !waiting) onCancel() }
      return h(Dialog, { title: '创建科研项目', close }, h('form', { className: 'lw-form', onSubmit: submit },
        h('label', null, '项目名称', h('input', { autoFocus: true, required: true, maxLength: 80, value: name, onChange: e => setName(e.target.value) })),
        error && h('span', { role: 'alert' }, error),
        h('div', { className: 'lw-actions' },
          Btn({ variant: 'primary', type: 'submit', disabled: busy || waiting }, waiting ? '创建中…' : '创建'),
          Btn({ variant: 'ghost', onClick: close, disabled: busy || waiting }, '取消'))))
    }

    function PluginForm({ rows, close }) {
      const [scope, setScope] = React.useState('')
      const [name, setName] = React.useState('')
      const [prompt, setPrompt] = React.useState('')
      const [status, setStatus] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [id] = React.useState(requestId)
      const safeClose = () => { if (!busy) close() }
      const submit = async e => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          await api('plugin', { name, prompt, scope, requestId: id })
          window.dispatchEvent(new Event(updated))
          close()
        } catch (err) { setStatus(err.message); setBusy(false) }
      }
      return h(Dialog, { title: '创建项目插件', close: safeClose }, h('form', { className: 'lw-form', onSubmit: submit },
        h('label', null, '插件名称', h('input', { required: true, autoFocus: true, maxLength: 80, value: name, onChange: e => setName(e.target.value) })),
        h('label', null, '适用范围', h('select', { required: true, value: scope, onChange: e => setScope(e.target.value) },
          h('option', { value: '', disabled: true }, '选择项目或全部项目'), h('option', { value: 'all' }, '全部项目'),
          rows.filter(r => r.scope !== 'global').map(r => h('option', { key: r.scope, value: r.scope }, r.name)))),
        h('label', null, '交给项目助手的指令', h('textarea', { rows: 4, required: true, maxLength: 12000, value: prompt, onChange: e => setPrompt(e.target.value) })),
        status && h('span', { role: 'alert' }, status),
        h('div', { className: 'lw-actions' },
          Btn({ variant: 'primary', type: 'submit', disabled: busy }, '创建插件'),
          Btn({ variant: 'ghost', onClick: safeClose, disabled: busy }, '取消'))))
    }

    function FeatureRenameDialog({ workspaceId, projectName, featureId, currentLabel, onSaved, onCancel }) {
      const [label, setLabel] = React.useState(currentLabel || '')
      const [busy, setBusy] = React.useState(false)
      const [err, setErr] = React.useState('')
      const close = () => { if (!busy) onCancel() }
      const submit = async e => {
        e.preventDefault()
        const trimmed = label.trim()
        if (busy || !trimmed) return
        setBusy(true); setErr('')
        try {
          const result = await project(workspaceId, 'feature_rename', { featureId, label: trimmed })
          await onSaved?.(result)
          window.dispatchEvent(new Event(updated))
          onCancel()
        } catch (error) {
          setErr(error.message)
          setBusy(false)
        }
      }
      return h(Dialog, { title: '重命名项目功能', close }, h('form', { className: 'lw-form', onSubmit: submit },
        projectName && h('p', { className: 'lw-hint', style: { margin: 0 } }, `所属项目：${projectName}`),
        h('label', null, '功能显示名称',
          h('input', { required: true, autoFocus: true, maxLength: 80, value: label, onChange: e => setLabel(e.target.value) })),
        err && h('p', { role: 'alert' }, err),
        h('div', { className: 'lw-actions' },
          Btn({ variant: 'primary', type: 'submit', disabled: busy || !label.trim() }, busy ? '保存中…' : '保存'),
          Btn({ variant: 'ghost', onClick: close, disabled: busy }, '取消'))))
    }

    const isImageResource = item => Boolean(item && entryImageSrc(item) && /\.(png|jpe?g|webp|gif|svg)$/i.test(item.path || ''))
    const isReadableEntry = item => Boolean(item && !isImageResource(item) && (item.libraryId || item.path || item.url?.startsWith('/api/workspace/pdf/')))
    const libResKind = item => item.kind === 'pdf' || /\.pdf$/i.test(item.path || item.text) ? 'pdf'
      : item.kind === 'repository' ? 'repository'
      : item.kind === 'output' ? 'output'
      : item.kind === 'link' ? 'link' : 'file'

    function categorizeFeatureItems(feature, featMeta, value, items) {
      const baseCats = Array.isArray(featMeta?.categories) && featMeta.categories.length
        ? featMeta.categories : [['push', '推送消息'], ['file', '文件资源']]
      const buckets = new Map(baseCats.map(([key, label]) => [key, { key, label, entries: [] }]))
      const labelToKey = new Map(baseCats.map(([key, label]) => [label, key]))
      const linkedIdeaIds = new Set((value?.rails?.goals || []).map(g => g.ideaId).filter(Boolean))
      const ensureBucket = key => {
        if (!buckets.has(key)) buckets.set(key, { key, label: key, entries: [] })
        return buckets.get(key)
      }
      for (const it of items) {
        let cat = it.category
        if (cat && labelToKey.has(cat)) cat = labelToKey.get(cat)
        if (!cat) {
          const isFile = isReadableEntry(it) || isImageResource(it)
          if (feature === 'feed') cat = isFile ? 'file' : feedKind(it)
          else if (feature === 'ideas') cat = isFile ? 'file' : (linkedIdeaIds.has(it.id) ? 'converted' : 'fresh')
          else if (feature === 'goals') cat = isFile ? 'file' : (it.done ? 'completed' : 'pending')
          else if (feature === 'library') cat = libResKind(it)
          else cat = isFile ? 'file' : 'push'
        } else if (feature === 'ideas' && linkedIdeaIds.has(it.id) && cat === 'push') {
          cat = 'converted'
        }
        ensureBucket(cat).entries.push(it)
      }
      if (feature === 'ideas' && Array.isArray(value?.reviews) && value.reviews.length) {
        ensureBucket('review').entries.push(...value.reviews.map(r => ({
          ...r, _metaType: 'review', text: r.reply || 'AI 复盘建议',
        })))
      }
      return [...buckets.values()]
    }

    const deliveryStatus = {
      WAITING_APPROVAL: '等待批准', QUEUED: '已排队', RUNNING: '运行中', SUCCEEDED: '已完成',
      FAILED: '运行失败', CANCELLED: '已取消', INTERRUPTED: '运行中断', BLOCKED: '暂时无法执行',
    }

    function TrialReceipt({ sessionId, run }) {
      const [open, setOpen] = React.useState(false)
      const [file, setFile] = React.useState('')
      const [result, setResult] = React.useState(null)
      React.useEffect(() => {
        if (!open) return
        const controller = new AbortController()
        setResult(null)
        api('dialog-delivery', { sessionId, runId: run.id, file }, controller.signal).then(data => {
          if (!controller.signal.aborted) setResult(data)
        }).catch(error => {
          if (!controller.signal.aborted) setResult({ error: error.message })
        })
        return () => controller.abort()
      }, [sessionId, run.id, run.status, open, file])
      return h('div', { className: 'lw-trial-receipt' },
        h('button', { type: 'button', className: 'lw-receipt-toggle', 'aria-expanded': open,
          onClick: () => { setFile(''); setOpen(!open) } },
          h('span', null, run.projectName ? run.projectName + ' · ' + run.title : run.title),
          h('span', { className: 'lw-hint' }, deliveryStatus[run.status] || run.status)),
        open && h('div', { className: 'lw-receipt-detail' },
          !result ? '读取中…' : file ? h(React.Fragment, null,
            h('button', { type: 'button', onClick: () => setFile('') }, '返回运行结果'),
            h('pre', null, result.error || result.text, result.truncated && '…'))
            : h(React.Fragment, null,
              result.error && h('p', null, result.error),
              (result.stdout || result.stderr) && h('pre', null, [result.stdout, result.stderr].filter(Boolean).join('\n')),
              (result.artifacts || []).map(item => h('button', { type: 'button', key: item.name,
                onClick: () => setFile(item.name) }, item.name)),
              !result.error && !result.stdout && !result.stderr && !result.artifacts?.length &&
                h('span', null, run.status === 'WAITING_APPROVAL' ? '可在项目聊天的代码沙盒中批准这次试跑。' :
                  result.exitCode != null ? '退出码 ' + result.exitCode : '尚无运行输出。'))))
    }

    function ConversationReceipts({ sessionId }) {
      const [runs, setRuns] = React.useState([])
      React.useEffect(() => {
        const controller = new AbortController()
        let busy = false
        const read = async () => {
          if (busy || document.hidden) return
          busy = true
          try {
            const data = await api('dialog-delivery', { sessionId }, controller.signal)
            if (!controller.signal.aborted && Array.isArray(data)) setRuns(data)
          } catch { /* Keep the last received state through temporary disconnects. */ }
          finally { busy = false }
        }
        read()
        const timer = setInterval(read, 5000)
        document.addEventListener('visibilitychange', read)
        window.addEventListener(updated, read)
        return () => {
          controller.abort()
          clearInterval(timer)
          document.removeEventListener('visibilitychange', read)
          window.removeEventListener(updated, read)
        }
      }, [sessionId])
      if (!runs.length) return null
      const receipt = run => h(TrialReceipt, { key: run.id, sessionId, run })
      return h('section', { className: 'lw-receipts', 'aria-label': '此对话的试跑回执' },
        runs.slice(0, 2).map(receipt),
        runs.length > 2 && h('details', null, h('summary', null, '更早的试跑（' + (runs.length - 2) + '）'), runs.slice(2).map(receipt)))
    }

    function Panel({
      workspaceId, row, feature, featMeta, title, subtitle, emptyTitle,
      value, loadError, persisted, bot, openModels, onRenamed,
    }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [reading, setReading] = React.useState(null)
      const [activeItemId, setActiveItemId] = React.useState(null)
      const [activeReview, setActiveReview] = React.useState(null)
      const [quickModal, setQuickModal] = React.useState(false)
      const [editingBot, setEditingBot] = React.useState(false)
      const [draftText, setDraftText] = React.useState(() => persisted?.draft || '')

      // Sub-form state
      const [topic, setTopic] = React.useState('')
      const [quickText, setQuickText] = React.useState('')
      const [quickDue, setQuickDue] = React.useState('')
      const [quickDeps, setQuickDeps] = React.useState([])
      const [quickCat, setQuickCat] = React.useState('push')
      const [linkInput, setLinkInput] = React.useState('')
      const [editingId, setEditingId] = React.useState(null)
      const [editDraft, setEditDraft] = React.useState({ text: '', due: '' })
      const [plusOpen, setPlusOpen] = React.useState(false)

      const detailRef = React.useRef(null)
      const bottomRef = React.useRef(null)
      const fileInputRef = React.useRef(null)
      const textareaRef = React.useRef(null)
      const plusWrapRef = React.useRef(null)

      React.useEffect(() => {
        if (!plusOpen) return
        const onDoc = e => {
          if (plusWrapRef.current?.contains(e.target)) return
          setPlusOpen(false)
        }
        const onKey = e => { if (e.key === 'Escape') setPlusOpen(false) }
        document.addEventListener('pointerdown', onDoc)
        document.addEventListener('keydown', onKey)
        return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
      }, [plusOpen])

      React.useLayoutEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(120, Math.max(32, el.scrollHeight)) + 'px'
      }, [draftText])

      const run = async act => {
        if (busy) return
        setBusy(true); setError('')
        try { await act(); window.dispatchEvent(new Event(updated)) }
        catch (err) { setError(err.message) } finally { setBusy(false) }
      }

      if (!value?.rails) {
        return h('div', { className: 'lw-panel', style: { padding: 24 }, role: loadError ? 'alert' : 'status' }, loadError || '正在读取项目…')
      }

      const items = value.rails[feature] || []
      const action = (name, args) => project(workspaceId, name, args)
      const ordered = items.slice().reverse()
      const groups = categorizeFeatureItems(feature, featMeta, value, ordered)


      const scrollToDetail = () => setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30)
      const readResource = (id, page = 1, keepItem = null) => run(async () => {
        setActiveReview(null)
        if (keepItem) setActiveItemId(keepItem.id)
        const res = await action('read', { id, page })
        setReading({ id, ...res })
        scrollToDetail()
      })

      const openEntry = entry => {
        if (!entry) return
        if (entry._metaType === 'review') {
          setReading(null); setActiveItemId(null)
          setActiveReview(entry)
          scrollToDetail()
          return
        }
        setActiveReview(null)
        setActiveItemId(entry.id)
        if (isReadableEntry(entry)) {
          readResource(entry.libraryId || entry.id, 1, entry)
        } else {
          setReading(null)
          scrollToDetail()
        }
      }

      const importFile = file => run(async () => {
        if (!file || !file.size || file.size > 25 * 1024 * 1024) throw Error('请选择 25 MiB 以内的文件。')
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const res = await action('upload', { name: file.name, data, featureId: feature })
        setNotice('已导入文件：' + file.name)
        const targetEntry = res.linkedItem || res
        if (targetEntry?.id) openEntry(targetEntry)
      })

      const submitComposer = async e => {
        e?.preventDefault?.()
        const text = draftText.trim()
        if (!text || bot.sending) return
        persisted.draft = ''
        setDraftText('')
        try {
          await bot.sendPrompt(text)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60)
        } catch (err) {
          setError(err.message)
        }
      }

      const activeItem = activeItemId ? items.find(x => x.id === activeItemId) : null
      const libraryItems = value.rails.library || []
      const libraryUrls = new Set(libraryItems.map(x => x.url).filter(Boolean))
      const goalsList = value.rails.goals || []
      const linkedIdeaIds = new Set(goalsList.map(g => g.ideaId).filter(Boolean))

      const hasDetail = Boolean(reading || activeItem || activeReview)
      const hasContent = items.length > 0 || bot.messages.length > 0 || bot.running
        || hasDetail || (feature === 'ideas' && (value.reviews?.length || 0) > 0)

      const kindBadges = { paper: '论文', news: '新闻', repository: '仓库', pdf: 'PDF', output: '实验产物', link: '链接', file: '文件', push: '推送', fresh: '灵感', converted: '已转目标', pending: '追踪中', completed: '已完成' }
      const catColor = key => ({
        completed: 'var(--dsw-alias-state-success-primary,#16a34a)',
        output: 'var(--dsw-alias-state-success-primary,#16a34a)',
        converted: 'var(--dsw-alias-state-success-primary,#16a34a)',
        pdf: 'var(--dsw-alias-label-primary,#0f1115)',
        paper: 'var(--dsw-alias-label-primary,#0f1115)',
        fresh: 'var(--dsw-alias-state-business-primary,#3b82f6)',
        pending: 'var(--dsw-alias-state-business-primary,#3b82f6)',
        repository: 'var(--dsw-alias-label-secondary,#475569)',
        news: 'var(--dsw-alias-state-warn-primary,#ca8a04)',
        review: '#8b5cf6',
        file: '#64748b',
      }[key] || 'var(--dsw-alias-label-tertiary,#94a3b8)')
      const catIcon = key => ({
        paper: 'file', news: 'activity', repository: 'repo',
        fresh: 'ideas', converted: 'goals', review: 'spark',
        pending: 'goals', completed: 'check', workflows: 'activity',
        pdf: 'file', output: 'spark', link: 'link',
        file: 'file', push: 'bot',
      }[key] || featureIcon(feature))
      const nonEmptyGroups = groups.filter(g => g.entries.length > 0)
      const totalGrouped = nonEmptyGroups.reduce((sum, g) => sum + g.entries.length, 0)
      const doneGoals = feature === 'goals' ? items.filter(x => x.done).length : 0
      const goalPct = feature === 'goals' && items.length ? Math.round((doneGoals / items.length) * 100) : 0
      const ringCircumference = 2 * Math.PI * 13

      return h('section', {
        className: 'lw-panel lw-fbot-shell',
        style: { flex: 1, minHeight: 0, gap: 0 },
        'aria-label': title,
      },
        h('div', { className: 'lw-fbot-main' },
          h('div', { className: 'lw-fbot-scroll' },
            h('div', { className: 'lw-fbot-center' },
              h('header', { className: 'lw-fbot-head' },
                h('button', {
                  type: 'button', className: 'lw-bot-pill',
                  'aria-label': '修改功能 Bot 信息 ' + title,
                  title: '查看或编辑功能 Bot 信息',
                  onClick: () => setEditingBot(true),
                },
                  h('span', { className: 'lw-bot-pill-badge', 'data-tone': feature, 'aria-hidden': true },
                    h(Icon, { name: featMeta.symbol || featureIcon(feature) })),
                  h('span', { className: 'lw-bot-pill-name' }, title),
                  h('span', { className: 'lw-bot-pill-edit', 'aria-hidden': true }, h(Icon, { name: 'edit' })))),

              busy && h('p', { role: 'status', className: 'lw-hint' }, '正在处理…'),
              notice && h('p', { role: 'status', className: 'lw-notice' }, notice),
              (error || bot.error) && h('p', { role: 'alert', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                h('span', null, error || bot.error),
                openModels && /模型|API|key|密钥/i.test(error || bot.error) && Btn({ variant: 'ghost', size: 'xs', onClick: openModels }, '模型与 API 设置')),

              !hasContent ? h('div', { className: 'lw-fbot-empty-wrap' },
                h('div', { className: 'lw-empty' },
                  h('div', { className: 'lw-empty-emblem', 'aria-hidden': true }, h(Icon, { name: featMeta.symbol || featureIcon(feature) })),
                  h('strong', null, emptyTitle),
                  h('div', { className: 'lw-empty-chips' },
                    h('button', { type: 'button', className: 'lw-empty-chip', onClick: () => setQuickModal(true) },
                      h(Icon, { name: 'edit' }), h('span', null, '快速录入')),
                    h('button', { type: 'button', className: 'lw-empty-chip', onClick: () => fileInputRef.current?.click() },
                      h(Icon, { name: 'upload' }), h('span', null, '上传文件')),
                    h('button', { type: 'button', className: 'lw-empty-chip', onClick: () => textareaRef.current?.focus() },
                      h(Icon, { name: 'chat' }), h('span', null, '对话生成')))))
                : h(React.Fragment, null,
                  items.length > 0 && h('div', { className: 'lw-fbot-stats', 'aria-label': title + ' 进度与分类概览' },
                    h('div', { className: 'lw-fbot-stats-top' },
                      feature === 'goals'
                        ? h('div', { className: 'lw-goal-ring-wrap' },
                          h('svg', { className: 'lw-goal-ring', viewBox: '0 0 34 34', 'aria-hidden': true },
                            h('circle', { className: 'lw-goal-ring-bg', cx: 17, cy: 17, r: 13 }),
                            h('circle', {
                              className: 'lw-goal-ring-fg', cx: 17, cy: 17, r: 13,
                              strokeDasharray: ringCircumference,
                              strokeDashoffset: ringCircumference * (1 - goalPct / 100),
                            })),
                          h('div', { style: { display: 'grid', lineHeight: 1.3 } },
                            h('strong', { style: { fontSize: 'var(--lw-ui-sm)' } }, `完成 ${doneGoals} / ${items.length}`),
                            h('span', { className: 'lw-hint lw-mono', style: { fontSize: 'var(--lw-ui-xs)' } }, goalPct + '%')))
                        : h('span', { style: { fontSize: 'var(--lw-ui-xs)', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } },
                          `共 ${items.length} 项`),
                      h('div', { className: 'lw-fbot-stat-pills' },
                        nonEmptyGroups.map(g => h('span', { key: g.key, className: 'lw-stat-chip' },
                          h('span', { className: 'lw-stat-dot', style: { background: catColor(g.key) } }),
                          g.label, ' ', g.entries.length)))),
                    totalGrouped > 0 && h('div', { className: 'lw-stat-track', 'aria-hidden': true },
                      nonEmptyGroups.map(g => h('div', {
                        key: g.key,
                        className: 'lw-stat-seg',
                        style: { width: Math.max(8, Math.round((g.entries.length / totalGrouped) * 100)) + '%', background: catColor(g.key) },
                      })))),

                  hasDetail && h('div', { ref: detailRef, className: 'lw-fbot-detail' },
                    reading ? h('section', { className: 'lw-reader-pane', style: { position: 'static' }, 'aria-label': '资源内容' },
                      h('div', { className: 'lw-reader-head' },
                        h('strong', { style: { fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 140px' } },
                          activeItem?.text || libraryItems.find(x => x.id === reading.id)?.text || '资源阅读'),
                        h('div', { className: 'lw-actions' },
                          reading.pages && Btn({ variant: 'secondary', size: 'xs', disabled: busy || reading.page <= 1, onClick: () => readResource(reading.id, reading.page - 1, activeItem) }, '上一页'),
                          reading.pages && h('span', { className: 'lw-hint lw-mono' }, reading.page, ' / ', reading.pages),
                          reading.pages && Btn({ variant: 'secondary', size: 'xs', disabled: busy || reading.page >= reading.pages, onClick: () => readResource(reading.id, reading.page + 1, activeItem) }, '下一页'),
                          Btn({ variant: 'accent', size: 'xs', onClick: () => {
                            const prompt = `请使用 labweave_paper_read / labweave_resource_read 阅读资源 ${reading.id}（当前第 ${reading.page || 1} 页），总结核心内容并归档推送。`
                            setDraftText(prompt); persisted.draft = prompt
                          } }, '填入提问'),
                          h('button', {
                            type: 'button', className: 'lw-dialog-close', 'aria-label': '关闭', title: '关闭',
                            onClick: () => { setReading(null); setActiveItemId(null) },
                          }, h(Icon, { name: 'close' })))),
                      h('pre', { className: 'lw-reader-body' }, reading.text || reading.files?.join('\n') || '该页没有可提取文本。'))
                    : activeReview ? h('div', { style: { display: 'grid', gap: 8 } },
                      h('div', { className: 'lw-fbot-detail-head' },
                        h('strong', null, 'AI 复盘详情'),
                        h('button', { type: 'button', className: 'lw-dialog-close', 'aria-label': '关闭', title: '关闭', onClick: () => setActiveReview(null) },
                          h(Icon, { name: 'close' }))),
                      h('span', { className: 'lw-hint lw-mono' }, fmtDateTime(activeReview.ts)),
                      h('div', { className: 'lw-stream-body' }, activeReview.reply))
                    : activeItem && h('div', { style: { display: 'grid', gap: 10 } },
                      h('div', { className: 'lw-fbot-detail-head' },
                        h('div', { className: 'lw-actions' },
                          h(Tag, { tone: 'neutral' }, kindBadges[activeItem.category] || (activeItem.source === 'DSH' ? 'Weave' : activeItem.source) || title),
                          activeItem.ts && h('span', { className: 'lw-hint lw-mono' }, fmtDateTime(activeItem.ts))),
                        h('button', { type: 'button', className: 'lw-dialog-close', 'aria-label': '关闭', title: '关闭', onClick: () => setActiveItemId(null) },
                          h(Icon, { name: 'close' }))),
                      editingId === activeItem.id ? h('form', { className: 'lw-form', onSubmit: e => {
                        e.preventDefault(); if (!editDraft.text.trim()) return
                        const actName = feature === 'goals' ? 'goal_update' : 'idea_update'
                        run(async () => {
                          await action(actName, { id: activeItem.id, text: editDraft.text.trim(), ...(feature === 'goals' ? { due: editDraft.due } : {}) })
                          setEditingId(null)
                        })
                      } },
                        h('textarea', { className: 'lw-textarea', rows: 3, value: editDraft.text, onChange: e => setEditDraft({ ...editDraft, text: e.target.value }) }),
                        feature === 'goals' && h('input', { type: 'date', className: 'lw-input', value: editDraft.due || '', onChange: e => setEditDraft({ ...editDraft, due: e.target.value }) }),
                        h('div', { className: 'lw-actions' },
                          Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy }, '保存'),
                          Btn({ variant: 'ghost', size: 'xs', onClick: () => setEditingId(null) }, '取消')))
                      : (() => {
                        const activeImgSrc = entryImageSrc(activeItem)
                        return h(React.Fragment, null,
                          activeItem.title && h('h3', { className: 'lw-fbot-detail-title' }, activeItem.title),
                          activeImgSrc && h('figure', { className: 'lw-fbot-detail-figure' },
                            h(EntryImage, { src: activeImgSrc, alt: activeItem.caption || activeItem.title || '推送配图', className: 'lw-fbot-detail-media' }),
                            activeItem.caption && h('figcaption', { className: 'lw-fbot-detail-caption' }, activeItem.caption)),
                          h('div', { className: 'lw-stream-body' }, activeItem.text),
                          activeItem.url && /^https?:\/\//i.test(activeItem.url) && h('a', { className: 'lw-item-link', href: activeItem.url, target: '_blank', rel: 'noreferrer' }, activeItem.url + ' ↗'),
                          h('div', { className: 'lw-actions' },
                            feature === 'feed' && Btn({ variant: 'primary', size: 'xs', disabled: busy, onClick: () => run(async () => {
                              await action('idea_create', { text: activeItem.text, ...(activeItem.url ? { url: activeItem.url } : {}) })
                              setNotice('已保存到「点子」。')
                            }) }, '转为点子'),
                            feature === 'feed' && activeItem.url && /^https?:\/\//i.test(activeItem.url) && Btn({ variant: 'secondary', size: 'xs', disabled: busy || libraryUrls.has(activeItem.url), onClick: () => run(async () => {
                              await action('link', { url: activeItem.url, text: activeItem.text, kind: feedKind(activeItem) })
                              setNotice('已收藏到「资源库」。')
                            }) }, libraryUrls.has(activeItem.url) ? '已收藏' : '收藏到资源库'),
                            feature === 'ideas' && Btn({ variant: 'primary', size: 'xs', disabled: busy || linkedIdeaIds.has(activeItem.id), onClick: () => run(async () => {
                              await action('goal_create', { text: activeItem.text, ideaId: activeItem.id })
                              setNotice('已转化为研究目标。')
                            }) }, linkedIdeaIds.has(activeItem.id) ? '已转目标' : '转为目标'),
                            feature === 'goals' && Btn({ variant: 'primary', size: 'xs', disabled: busy, onClick: () => run(() => action('goal_update', { id: activeItem.id, done: !activeItem.done })) }, activeItem.done ? '标为未完成' : '标记完成'),
                            (feature === 'ideas' || feature === 'goals') && Btn({ variant: 'ghost', size: 'xs', onClick: () => { setEditingId(activeItem.id); setEditDraft({ text: activeItem.text, due: activeItem.due || '' }) } }, '编辑'),
                            isReadableEntry(activeItem) && Btn({ variant: 'primary', size: 'xs', onClick: () => readResource(activeItem.libraryId || activeItem.id, 1, activeItem) }, '阅读全文'),
                            Btn({ variant: 'secondary', size: 'xs', onClick: () => { const p = '请结合项目资料分析并补充这条记录：\n' + [activeItem.title, activeItem.text].filter(Boolean).join('\n'); setDraftText(p); persisted.draft = p } }, '交给 Bot 深入'),
                            Btn({ variant: 'danger', size: 'xs', disabled: busy, onClick: () => run(async () => {
                              if (feature === 'feed') await action('dismiss_feed', { id: activeItem.id, key: activeItem.url || activeItem.text })
                              else await action('entry_delete', { rail: feature, id: activeItem.id })
                              setActiveItemId(null)
                            }) }, feature === 'feed' ? '隐藏' : '删除')))
                      })())),

                  ordered.length > 0 && (feature === 'library'
                    ? h('div', { className: 'lw-doc-grid', 'aria-label': title + ' 上下文记录' },
                      ordered.map(item => {
                        const [headline, body] = entryHeadlineBody(item)
                        const imgSrc = entryImageSrc(item)
                        const isActive = activeItemId === item.id || reading?.id === item.id || (item.libraryId && reading?.id === item.libraryId)
                        const kind = libResKind(item)
                        const readable = isReadableEntry(item)
                        return h('article', {
                          key: item.id || feedKey(item),
                          className: 'lw-doc-card',
                          'data-active': isActive ? 'true' : 'false',
                          style: { cursor: 'pointer' },
                          onClick: () => openEntry(item),
                        },
                          h('div', { className: 'lw-doc-thumb', 'data-has-image': imgSrc ? 'true' : 'false' },
                            imgSrc
                              ? h(EntryImage, { src: imgSrc, alt: item.caption || headline, className: 'lw-doc-thumb-media' })
                              : h(React.Fragment, null,
                                h('div', { className: 'lw-doc-preview-title' }, headline),
                                h('div', { className: 'lw-doc-preview-lines', 'aria-hidden': true },
                                  h('span', { style: { width: '92%' } }),
                                  h('span', { style: { width: '74%' } }),
                                  h('span', { style: { width: '82%' } })))),
                          h('div', { className: 'lw-doc-body' },
                            h('div', { className: 'lw-doc-title-row' },
                              h('span', { className: 'lw-res-dot', 'data-kind': kind, style: { marginTop: 6 } }),
                              h('span', { className: 'lw-doc-title', title: item.text }, body || headline)),
                            h('div', { className: 'lw-doc-foot' },
                              h(Tag, { tone: 'neutral' }, kindBadges[item.category || kind] || kindBadges[kind] || title),
                              readable && Btn({ variant: 'secondary', size: 'xs', onClick: e => { e.stopPropagation(); openEntry(item) } }, '阅读'))))
                      }))
                    : h('div', { style: { display: 'grid', gap: 8 }, 'aria-label': title + ' 上下文记录' },
                      ordered.map(item => {
                        const [headline, body] = entryHeadlineBody(item)
                        const imgSrc = entryImageSrc(item)
                        const isActive = activeItemId === item.id || reading?.id === item.id || (item.libraryId && reading?.id === item.libraryId)
                        const readable = isReadableEntry(item)
                        const itemIcon = item.done ? 'check' : catIcon(item.category || (feature === 'feed' ? feedKind(item) : feature))
                        return h('article', {
                          key: item.id || feedKey(item),
                          className: 'lw-fbot-card',
                          'data-active': isActive ? 'true' : 'false',
                          'data-illustrated': imgSrc ? 'true' : 'false',
                          onClick: () => openEntry(item),
                        },
                          feature === 'goals'
                            ? h('input', {
                              type: 'checkbox', className: 'lw-checkbox', style: { marginTop: 6 }, checked: !!item.done,
                              'aria-label': '完成 ' + item.text,
                              onClick: e => e.stopPropagation(),
                              onChange: e => run(() => action('goal_update', { id: item.id, done: e.target.checked })),
                            })
                            : h('span', { className: 'lw-fbot-card-icon', 'aria-hidden': true }, h(Icon, { name: itemIcon })),
                          h('div', { className: 'lw-fbot-card-body' },
                            h('div', { className: 'lw-stream-head', style: { marginBottom: 0 } },
                              h('span', { className: 'lw-stream-title' }, headline),
                              h('div', { className: 'lw-actions' },
                                item.due && h('span', { className: 'lw-hint lw-mono', style: { fontSize: 'var(--lw-ui-xs)' } }, item.due),
                                h(Tag, { tone: item.done ? 'success' : 'neutral' }, item.done ? '已完成' : (kindBadges[item.category] || (item.source === 'DSH' ? 'Weave' : item.source) || title)),
                                readable && Btn({ variant: 'secondary', size: 'xs', onClick: e => { e.stopPropagation(); openEntry(item) } }, '阅读'))),
                            (body || item.caption) && h('div', { className: 'lw-muse-row-sub' }, body || item.caption)),
                          imgSrc && h(EntryImage, { src: imgSrc, alt: item.caption || headline, className: 'lw-fbot-card-media' }))
                      }))),

                  (bot.messages.length > 0 || bot.running) && h('div', { className: 'lw-bot-turns', 'aria-label': title + ' 对话记录' },
                    bot.messages.map(msg => h('div', { key: msg.id, className: 'lw-bot-msg', 'data-role': msg.role },
                      h('div', { className: 'lw-bot-msg-meta' },
                        h('span', null, msg.role === 'user' ? '你' : title),
                        msg.time && h('span', { className: 'lw-mono' }, fmtDateTime(msg.time))),
                      msg.text)),
                    bot.running && h('div', { className: 'lw-hint', role: 'status' }, bot.status || title + ' 正在回复…'))),
              bot.sessionId && h(ConversationReceipts, { key: bot.sessionId, sessionId: bot.sessionId }),
              h('div', { ref: bottomRef }))),

          h('form', { className: 'lw-fbot-composer-wrap', onSubmit: submitComposer },
            h('div', { ref: plusWrapRef, className: 'lw-fbot-composer' },
              h('input', {
                ref: fileInputRef,
                type: 'file',
                'aria-label': '导入文件',
                disabled: busy,
                style: { display: 'none' },
                onChange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f) },
              }),
              h('button', {
                type: 'button',
                className: 'lw-fbot-plus-btn',
                'aria-label': '添加内容或文件',
                'aria-expanded': plusOpen,
                'aria-haspopup': 'menu',
                title: '导入文件或快速录入',
                disabled: busy,
                onClick: () => setPlusOpen(prev => !prev),
              }, h(Icon, { name: 'plus' })),
              plusOpen && h('div', { className: 'lw-fbot-plus-menu', 'aria-label': '添加操作' },
                h('button', {
                  type: 'button', disabled: busy,
                  onClick: () => { setPlusOpen(false); fileInputRef.current?.click() },
                }, h(Icon, { name: 'upload' }), h('span', null, '导入文件')),
                h('button', {
                  type: 'button',
                  onClick: () => { setPlusOpen(false); setQuickModal(true) },
                }, h(Icon, { name: 'edit' }), h('span', null, '+ 录入'))),
              h('textarea', {
                ref: textareaRef,
                rows: 1,
                'aria-label': '向 ' + title + ' 发送消息',
                placeholder: '消息',
                value: draftText,
                onChange: e => { setDraftText(e.target.value); persisted.draft = e.target.value },
                onKeyDown: e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault()
                    submitComposer()
                  }
                },
              }),
              h('button', {
                type: 'submit',
                className: 'lw-fbot-send-btn',
                'aria-label': '发送',
                title: bot.sending ? '发送中…' : '发送',
                disabled: busy || bot.sending || !draftText.trim(),
              }, h(Icon, { name: 'send' }))))),

        quickModal && h(Dialog, { title: title + ' · 快速录入', close: () => { if (!busy) setQuickModal(false) } },
          feature === 'feed' ? h('form', { className: 'lw-form', onSubmit: e => {
            e.preventDefault(); if (!topic.trim()) return
            run(async () => { await action('topic', { topic: topic.trim() }); setTopic(''); setNotice('主题已保存。'); setQuickModal(false) })
          } },
            h('label', null, '订阅关键词', h('input', { required: true, autoFocus: true, value: topic, placeholder: value.topic || '输入关键词…', onChange: e => setTopic(e.target.value) })),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'primary', type: 'submit', disabled: busy || !topic.trim() }, '保存订阅'),
              value.topic && Btn({ variant: 'secondary', disabled: busy, onClick: () => run(async () => { await action('refresh_feed'); setNotice('动态已刷新。'); setQuickModal(false) }) }, '立即刷新动态'),
              Btn({ variant: 'ghost', disabled: busy, onClick: () => setQuickModal(false) }, '取消')))
          : feature === 'library' ? h('form', { className: 'lw-form', onSubmit: e => {
            e.preventDefault(); if (!linkInput.trim()) return
            run(async () => { await action('link', { url: linkInput.trim() }); setLinkInput(''); setNotice('已保存资源链接。'); setQuickModal(false) })
          } },
            h('label', null, '资源链接 / Git 仓库地址', h('input', { required: true, autoFocus: true, type: 'url', value: linkInput, placeholder: 'https://…', onChange: e => setLinkInput(e.target.value) })),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'primary', type: 'submit', disabled: busy || !linkInput.trim() }, '添加链接'),
              Btn({ variant: 'secondary', disabled: busy || !linkInput.trim(), onClick: () => run(async () => { await action('clone', { url: linkInput.trim() }); setLinkInput(''); setNotice('Git 仓库已克隆至项目目录。'); setQuickModal(false) }) }, '克隆为 Git 仓库'),
              Btn({ variant: 'ghost', disabled: busy, onClick: () => setQuickModal(false) }, '取消')))
          : h('form', { className: 'lw-form', onSubmit: e => {
            e.preventDefault(); if (!quickText.trim()) return
            run(async () => {
              if (feature === 'ideas') {
                await action('idea_create', { text: quickText.trim() })
              } else if (feature === 'goals') {
                await action('goal_create', { text: quickText.trim(), ...(quickDue ? { due: quickDue } : {}), ...(quickDeps.length ? { dependsOn: quickDeps } : {}) })
              } else {
                await action('feature_push', { featureId: feature, text: quickText.trim(), category: quickCat.trim() || 'push', source: '手动录入' })
              }
              setQuickText(''); setQuickDue(''); setQuickDeps([]); setQuickModal(false)
            })
          } },
            h('label', null, feature === 'ideas' ? '新点子' : feature === 'goals' ? '新目标' : '内容',
              h('textarea', { required: true, autoFocus: true, rows: 3, value: quickText, placeholder: `输入要保存到「${title}」的内容…`, onChange: e => setQuickText(e.target.value) })),
            feature === 'goals' && h(React.Fragment, null,
              h('label', null, '截止日期（可选）', h('input', { type: 'date', value: quickDue, onChange: e => setQuickDue(e.target.value) })),
              goalsList.length > 0 && h('label', null, '前置目标（可选）',
                h('select', { multiple: true, style: { minHeight: 68 }, value: quickDeps,
                  onChange: e => setQuickDeps(Array.from(e.target.selectedOptions, o => o.value)) },
                  goalsList.map(g => h('option', { key: g.id, value: g.id }, g.text))))),
            feature !== 'ideas' && feature !== 'goals' && h('label', null, '归档分类',
              h('input', { value: quickCat, placeholder: '如 push / 论文 / 实验', onChange: e => setQuickCat(e.target.value) })),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'primary', type: 'submit', disabled: busy || !quickText.trim() }, '添加'),
              Btn({ variant: 'ghost', disabled: busy, onClick: () => setQuickModal(false) }, '取消')))),
        editingBot && h(FeatureBotEditDialog, {
          workspaceId, projectName: row?.name, featureId: feature, featMeta,
          currentLabel: title, currentHint: subtitle,
          onSaved: onRenamed, onCancel: () => setEditingBot(false),
        }))
    }

    const paths = {
      folder: 'M2.5 5.5h6l2 2h11v11.5H2.5z', chat: 'M4 4.5h16v12H10l-5.5 4V16H4z',
      feed: 'M3 13h4l3-7 4 12 3-7h4', ideas: 'M9 16c0-2-3-3-3-7a6 6 0 0 1 12 0c0 4-3 5-3 7z M10 20h4',
      goals: 'M5 21V3m1 1h13l-2.5 4L19 12H6', library: 'M3 5h4v14H3z M10 5h4v14h-4z M16 6l3-1 3 13-3 1z',
      plugin: 'M5 5h5a2.5 2.5 0 1 1 5 0h4v5a2.5 2.5 0 1 0 0 5v4H5z', plus: 'M12 5v14 M5 12h14',
      down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6', search: 'M16 16l4.5 4.5 M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
      edit: 'M4 16l11-11 4 4-11 11-5 1z M13 7l4 4',
      trash: 'M4 7h16 M9 7V4.5h6V7 M6.5 7l1 12.5h9L17.5 7',
      gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
      model: 'M4 6h16 M4 12h16 M4 18h16 M9 4v4 M15 10v4 M10 16v4',
      companion: 'M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M9.5 3.5v17',
      split: 'M4 7.5a2 2 0 0 1 2-2h4 M4 16.5a2 2 0 0 0 2 2h4 M20 7.5a2 2 0 0 0-2-2h-4 M20 16.5a2 2 0 0 1-2 2h-4 M12 3v18',
      sidebarRight: 'M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M15.5 3.5v17',
      close: 'M6 6l12 12 M18 6L6 18',
      bot: 'M12 3v3 M7 8h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z M9.5 13h.01 M14.5 13h.01',
      send: 'M12 19V5 M6 11l6-6 6 6',
      list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
      calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2',
      shield: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z M9 12l2 2 4-5',
      activity: 'M3 12h4l3-7 4 14 3-7h4',
      fingerprint: 'M12 10a2 2 0 0 0-2 2c0 1.4-.3 2.8-.9 4 M12 10a2 2 0 0 1 2 2c0 2.2-.5 4.2-1.4 6 M8.5 14.5c.3-1.2.5-2.4.5-3.5a3 3 0 0 1 6 0c0 1.8-.3 3.5-1 5.2 M5.5 13c.2-1 .3-2 .3-3a6.2 6.2 0 0 1 12.4 0c0 1.2-.1 2.4-.4 3.5 M6.8 6.5A8 8 0 0 1 17.2 6.5',
      back: 'M15 18l-6-6 6-6',
      upload: 'M12 16V4 M7 9l5-5 5 5 M4 19h16',
      file: 'M7 3h7l5 5v13H7z M14 3v5h5',
      repo: 'M7 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M17 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M7 11v6 M17 17v-1a3 3 0 0 0-3-3H9',
      spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
      check: 'M5 13l4 4L19 7',
      link: 'M10 13a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 5.8 M14 11a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3',
      memory: 'M9 3h6v4h4v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7h4z M9 12h6 M9 16h4',
    }
    function Icon({ name }) {
      if(typeof name==='string' && /^lucide:[a-z0-9-]+$/.test(name))
        return h('svg',{className:'lw-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,
          strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('use',{href:'./labweave-bot-avatars.svg#'+name.slice(7)}))
      if(botSymbols.includes(name)||(/\p{Extended_Pictographic}/u.test(name||'')))return h('span',{className:'lw-symbol-mark','aria-hidden':true},name)
      return h('svg', { className: 'lw-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }))
    }
    function useStore(source) {
      return React.useSyncExternalStore(fn => source.subscribe(fn), () => source.getSnapshot())
    }
    function sessionsFor(workspaceId, catalog, sessions, excludedIds) {
      const member = catalog.items.find(item => item.workspaceId === workspaceId)
      const archived = new Set(catalog.archivedSessionIds)
      return (member?.sessionIds || []).filter(id => !archived.has(id) && !excludedIds?.has?.(id))
        .map(id => sessions.byId[id]).filter(Boolean)
        .filter(row => row.origin !== 'subagent').sort((a, b) => b.updatedAt - a.updatedAt)
    }
    function historySessionsFor(workspaceId, catalog, sessions, excludedIds) {
      return sessionsFor(workspaceId, catalog, sessions, excludedIds).filter(row => !row.blank)
    }
    const chatTitle = s => s.title?.trim() || (s.blank ? '新对话' : '未命名对话')

    const featureIcon = id => paths[id] ? id : 'bot'
    const fallbackFeatures = () => Object.entries(features).map(([id, label]) => ({
      id, label, builtin: true, deletable: id !== 'chat', hint: '', emptyText: '', categories: [], botSessionId: null,
    }))

    function install(ctx) {
      let rows = []
      let disposed = false
      let revision = 0, choice, nameStrings, initialNavigation = false
      let remoteBus = null
      let remoteSession = null
      let remoteLlm = null
      let remoteSettings = null
      let remoteCredentials = null
      let settingsSchemaApi = null
      let modelDirectoriesApi = null
      let catalogModelGroups = []
      let catalogDefaultModel = null
      const syncingSessions = new Set()
      const flattenModelChoices = groups => {
        const list = []
        for (const g of groups || []) {
          const pName = g.name || g.id
          for (const m of g.models || []) {
            list.push({ value: `${g.id}/${m.id}`, provider: g.id, model: m.id, label: `${pName} · ${m.name || m.id}` })
          }
        }
        return list
      }
      const pickPreferredChoice = (choices, current, preferredDefault) => {
        if (!choices.length) return null
        const curVal = current?.provider && current?.model && current?.routable !== false ? `${current.provider}/${current.model}` : ''
        if (curVal) {
          const match = choices.find(c => c.value === curVal)
          if (match) return match
        }
        const def = preferredDefault || catalogDefaultModel
        const defVal = def?.provider && def?.model && def?.routable !== false ? `${def.provider}/${def.model}` : ''
        if (defVal) {
          const match = choices.find(c => c.value === defVal)
          if (match) return match
        }
        return choices[0]
      }
      const ensureSessionRoutableModel = async (sid, ref = null) => {
        if (!sid || syncingSessions.has(sid)) return
        const sess = ctx.sessions?.list?.getSnapshot?.().byId?.[sid]
        if (!sess || sess.origin === 'subagent' || sess.running) return
        syncingSessions.add(sid)
        try {
          if (!catalogModelGroups.length && remoteSession?.modelCatalog) {
            try {
              const res = await remoteSession.modelCatalog()
              if (res?.ok && res.value) {
                catalogModelGroups = res.value.groups || []
                catalogDefaultModel = res.value.default || null
              }
            } catch {}
          }
          let groups = catalogModelGroups
          let current = ref?.binding?.session?.getSnapshot?.()?.model || null
          let dir = null
          const isRetained = Boolean(ref?.binding?.session) || Object.values(sess.retainedBy || {}).some(count => Number(count) > 0)
          if (isRetained && modelDirectoriesApi?.directoryFor) {
            try {
              dir = modelDirectoriesApi.directoryFor(sid)
              await Promise.resolve(dir.load()).catch(() => {})
              const snap = dir.store?.getSnapshot?.() || {}
              if (snap.groups?.length) groups = snap.groups
              if (snap.current) current = snap.current
            } catch { dir = null }
          }
          const choices = flattenModelChoices(groups)
          if (!choices.length) return
          const curVal = current?.provider && current?.model && current?.routable !== false ? `${current.provider}/${current.model}` : ''
          if (curVal && choices.some(c => c.value === curVal)) return
          const target = pickPreferredChoice(choices, current, catalogDefaultModel)
          if (!target) return
          const selection = { provider: target.provider, model: target.model }
          if (ref?.binding?.session?.selectModel) {
            const res = await Promise.resolve(ref.binding.session.selectModel(selection)).catch(() => null)
            if (!res || res.ok !== false) return
          }
          if (dir?.select) {
            const res = await Promise.resolve(dir.select(selection)).catch(() => null)
            if (!res || res.ok !== false) return
          }
          if (remoteSession?.selectModel) {
            await remoteSession.selectModel({ sessionId: sid, ...selection }).catch(() => {})
          }
        } catch {} finally {
          syncingSessions.delete(sid)
        }
      }
      const syncModelCatalogAndSessions = async () => {
        if (remoteSession?.modelCatalog) {
          try {
            const res = await remoteSession.modelCatalog()
            if (res?.ok && res.value) {
              catalogModelGroups = res.value.groups || []
              catalogDefaultModel = res.value.default || null
            }
          } catch {}
        }
        const sessionsSnap = ctx.sessions?.list?.getSnapshot?.() || { byId: {} }
        const known = Object.values(sessionsSnap.byId || {}).filter(s => s && s.origin !== 'subagent' && !s.running)
        if (flattenModelChoices(catalogModelGroups).length || modelDirectoriesApi?.directoryFor) {
          await Promise.all(known.map(s => ensureSessionRoutableModel(s.id)))
        }
        window.dispatchEvent(new Event('labweave:model-updated'))
      }
      if (typeof ctx.inject === 'function') {
        const take = (dep, getter, setter) => {
          try {
            ctx.inject([dep], scope => {
              try {
                const value = (typeof scope.get === 'function' ? scope.get(dep) : null)
                  ?? dep.split('.').reduce((acc, part) => acc?.[part], scope)
                if (value && getter() !== value) { setter(value); void syncModelCatalogAndSessions(); changed() }
              } catch {}
            })
          } catch {}
        }
        const takeQuiet = (dep, getter, setter) => {
          try {
            ctx.inject([dep], scope => {
              try {
                const value = (typeof scope.get === 'function' ? scope.get(dep) : null)
                  ?? dep.split('.').reduce((acc, part) => acc?.[part], scope)
                if (value && getter() !== value) { setter(value); changed() }
              } catch {}
            })
          } catch {}
        }
        take('modelDirectories', () => modelDirectoriesApi, v => { modelDirectoriesApi = v })
        take('remote', () => remoteBus, v => {
          remoteBus = v
          try { if (v?.session && !remoteSession) remoteSession = v.session } catch {}
          try { if (v?.llm && !remoteLlm) remoteLlm = v.llm } catch {}
          try { if (v?.settings && !remoteSettings) remoteSettings = v.settings } catch {}
          try { if (v?.credentials && !remoteCredentials) remoteCredentials = v.credentials } catch {}
          if (typeof v?.$on === 'function') {
            for (const ev of ['credentials/reference-updated', 'llm/adapters-updated', 'settings/document-updated', 'llm/models-updated']) {
              try { v.$on(ev, () => { void syncModelCatalogAndSessions() }) } catch {}
            }
          }
        })
        take('remote.session', () => remoteSession, v => { remoteSession = v })
        takeQuiet('remote.llm', () => remoteLlm, v => { remoteLlm = v })
        takeQuiet('remote.settings', () => remoteSettings, v => { remoteSettings = v })
        takeQuiet('remote.credentials', () => remoteCredentials, v => { remoteCredentials = v })
        takeQuiet('settingsSchema', () => settingsSchemaApi, v => { settingsSchemaApi = v })
      }
      let knownSessionIds = new Set(Object.keys(ctx.sessions?.list?.getSnapshot?.().byId || {}))
      const unsubSessionSync = ctx.sessions?.list?.subscribe?.(() => {
        const byId = ctx.sessions?.list?.getSnapshot?.().byId || {}
        const added = []
        for (const id of Object.keys(byId)) {
          if (!knownSessionIds.has(id)) added.push(id)
        }
        knownSessionIds = new Set(Object.keys(byId))
        if (added.length) {
          for (const id of added) void ensureSessionRoutableModel(id)
        }
      })
      if (typeof ctx.on === 'function' && unsubSessionSync) {
        try { ctx.on('dispose', unsubSessionSync) } catch {}
      }
      const localBotSessions = new Set()
      const paneUiState = new Map()
      const lastChatByWorkspace = new Map()
      const paneStateFor = (workspaceId, feature) => {
        const key = workspaceId + ':' + feature
        if (!paneUiState.has(key)) paneUiState.set(key, { draft: '' })
        return paneUiState.get(key)
      }
      try { choice = JSON.parse(sessionStorage.getItem(selectionKey)) } catch {}
      const changed = () => { revision++; window.dispatchEvent(new Event(navEvent)) }
      const useNav = () => React.useSyncExternalStore(fn => {
        window.addEventListener(navEvent, fn); return () => window.removeEventListener(navEvent, fn)
      }, () => revision)
      const globalRow = () => rows.find(r => r.scope === 'global')
      const projectFeatures = (row, value) => {
        const list = value?.features || row?.features
        return Array.isArray(list) && list.length ? list : fallbackFeatures()
      }
      const hasFeature = (row, feature, value) => feature !== 'chat'
        && (projectFeatures(row, value).some(f => f.id === feature) || (!row?.features && !!features[feature]))
      const allBotSessionIds = value => {
        const set = new Set(localBotSessions)
        for (const r of rows) {
          for (const id of r.botSessionIds || []) set.add(id)
          for (const f of r.features || []) if (f?.botSessionId) set.add(f.botSessionId)
        }
        for (const id of value?.botSessionIds || []) set.add(id)
        for (const f of value?.features || []) if (f?.botSessionId) set.add(f.botSessionId)
        return set
      }
      const refresh = async () => {
        const value = await api('catalog')
        if (!disposed && JSON.stringify(rows) !== JSON.stringify(value)) {
          const oldName = globalRow()?.name
          rows = value
          for (const r of rows) {
            for (const id of r.botSessionIds || []) localBotSessions.add(id)
          }
          const name = globalRow()?.name
          if (name && name !== oldName) {
            nameStrings?.()
            nameStrings = ctx.locale.register('labweave.assistant', { zh: { name }, en: { name } })
          }
          changed()
        }
        return value
      }
      const notice = msg => window.dispatchEvent(new CustomEvent('labweave:notice', { detail: msg }))
      const ready = refresh().catch(() => [])
      function wrap(object, key, implementation) {
        const original = object[key]
        const replacement = function (...args) { return implementation.call(this, original.bind(this), ...args) }
        object[key] = replacement
        return () => { if (object[key] === replacement) object[key] = original }
      }
      const nav = ctx.uiWorkspace
      const currentSession = () => Object.values(ctx.sessions.list.getSnapshot().byId).find(s => s.retainedBy.mainView > 0)
      const currentRow = () => {
        const current = currentSession()
        const native = current && ctx.workspaces.list.getSnapshot().items.find(w => w.sessionIds.includes(current.id))
        const workspaceId = native?.workspaceId || current?.workspaceId
        return workspaceId ? rows.find(r => r.workspaceId === workspaceId) : undefined
      }
      let splitPanes = choice && choice.feature && choice.feature !== 'chat' ? [choice] : []
      let chatSplit = false
      let openSettingsRef = null
      function syncChoice(nextPane) {
        choice = nextPane
        if (nextPane) sessionStorage.setItem(selectionKey, JSON.stringify(nextPane))
        else sessionStorage.removeItem(selectionKey)
      }
      function selectPage(workspaceId, feature) {
        const row = rows.find(r => r.workspaceId === workspaceId && r.scope !== 'global')
        if (!row || !hasFeature(row, feature)) return
        hideActiveSandbox()
        const target = { workspaceId, feature }
        syncChoice(target)
        splitPanes = [target]
        chatSplit = false
        ctx.layout.selectPanel(pageKey)
        changed()
      }
      function rememberChat(id) {
        const sess = ctx.sessions.list.getSnapshot().byId[id]
        const wid = ctx.workspaces.list.getSnapshot().items.find(w => w.sessionIds.includes(id))?.workspaceId || sess?.workspaceId
        if (wid && sess && !sess.blank && !allBotSessionIds().has(id)) lastChatByWorkspace.set(wid, id)
      }
      function recentSessionFor(workspaceId, list) {
        const rememberedId = lastChatByWorkspace.get(workspaceId)
        return (rememberedId && list.find(s => s.id === rememberedId)) || list[0]
      }
      function forgetPage() { syncChoice(null); splitPanes = []; chatSplit = false }
      function openChat(id, { clearSplit = true } = {}) {
        rememberChat(id)
        if (clearSplit) forgetPage()
        nav.openSession(id)
        changed()
      }
      function draft(scope, prompt) {
        const row = rows.find(r => r.scope === scope)
        if (!row) throw Error('项目工作区未连接。')
        forgetPage()
        nav.startSession(row.workspaceId, { prompt, whenDraftExists: 'append' })
      }
      function openProjectChatSession(row, { clearSplit = true } = {}) {
        const members = historySessionsFor(row.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot(), allBotSessionIds())
        const target = recentSessionFor(row.workspaceId, members)
        if (clearSplit) forgetPage()
        if (target) { rememberChat(target.id); nav.openSession(target.id) }
        else nav.startSession(row.workspaceId)
        changed()
      }
      function splitPage(row, feature) {
        if (!row) return
        const activePanel = ctx.layout.panelInfo.getSnapshot().activePanelId
        if (feature === 'chat') {
          if (chatSplit && splitPanes.length > 0) {
            chatSplit = false
            ctx.layout.selectPanel(pageKey)
            changed()
            return
          }
          if (activePanel === pageKey && splitPanes.length === 0 && choice?.workspaceId) splitPanes = [choice]
          chatSplit = true
          openProjectChatSession(row, { clearSplit: false })
          closeDrawer()
          return
        }
        if (!hasFeature(row, feature)) return
        hideActiveSandbox()
        const pane = { workspaceId: row.workspaceId, feature }
        if (activePanel === pageKey && splitPanes.length === 0 && choice?.workspaceId) splitPanes = [choice]
        if (!splitPanes.some(p => p.workspaceId === pane.workspaceId && p.feature === pane.feature)) {
          splitPanes = [...splitPanes, pane]
        }
        syncChoice(pane)
        if (activePanel === null) {
          chatSplit = true
          changed()
        } else {
          chatSplit = false
          ctx.layout.selectPanel(pageKey)
          changed()
        }
        closeDrawer()
      }
      function toggleCompanionChat(fallbackRow) {
        if (chatSplit) {
          chatSplit = false
          if (splitPanes.length > 0) {
            syncChoice(splitPanes[0])
            ctx.layout.selectPanel(pageKey)
          }
          changed()
          return
        }
        if (splitPanes.length === 0 && fallbackRow && choice?.feature) splitPanes = [{ workspaceId: fallbackRow.workspaceId, feature: choice.feature }]
        chatSplit = true
        const targetRow = fallbackRow || globalRow()
        if (targetRow) openProjectChatSession(targetRow, { clearSplit: false })
        else { nav.startSession(); changed() }
      }
      function closePane(pane) {
        splitPanes = splitPanes.filter(p => !(p.workspaceId === pane.workspaceId && p.feature === pane.feature))
        if (splitPanes.length === 0) {
          const row = rows.find(r => r.workspaceId === pane.workspaceId)
          if (chatSplit) {
            syncChoice(null)
            changed()
          } else if (row) {
            openProjectChatSession(row, { clearSplit: true })
          } else {
            forgetPage(); nav.startSession(); changed()
          }
          return
        }
        syncChoice(splitPanes[0])
        if (!chatSplit) ctx.layout.selectPanel(pageKey)
        changed()
      }
      let generation = 0
      ctx.effect(() => wrap(nav, 'startSession', (start, id, options) => {
        const turn = ++generation
        if (id !== undefined) return start(id, options)
        const openGlobal = () => {
          const global = rows.find(r => r.scope === 'global')
          if (disposed || turn !== generation) return
          if (!global) { notice('无法打开全局助手，请重新连接科研服务。'); return }
          forgetPage()
          const last = sessionsFor(global.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot(), allBotSessionIds())[0]
          if (!options && last) openChat(last.id)
          else start(global.workspaceId, options)
        }
        if (rows.length) openGlobal()
        else ready.then(() => rows.length ? openGlobal() : refresh().then(openGlobal)).catch(err => notice(err.message))
      }), 'LabWeave global new session')
      ctx.effect(() => wrap(ctx.workspaces, 'rename', async (rename, id, title) => {
        if (!rows.some(r => r.workspaceId === id)) return rename(id, title)
        await api('rename', { workspaceId: id, name: title })
        await refresh()
        window.dispatchEvent(new Event(nameChanged)); window.dispatchEvent(new Event(updated))
        return ctx.workspaces.list.getSnapshot().items.find(r => r.workspaceId === id)
      }), 'LabWeave workspace names')
      ctx.effect(() => wrap(ctx.workspaces, 'delete', async (remove, id) => {
        const known = await refresh()
        const row = known.find(r => r.workspaceId === id)
        if (row?.scope === 'global') throw Error('全局助手保留所有全局对话。可在侧栏归档单个会话。')
        if (row) await api('delete', { workspaceId: id })
        const result = await remove(id)
        splitPanes = splitPanes.filter(p => p.workspaceId !== id)
        await refresh()
        window.dispatchEvent(new Event(updated))
        return result
      }), 'LabWeave global workspace lifetime')
      if (typeof ctx.locale.translate === 'function') ctx.effect(() => wrap(ctx.locale, 'translate', (original, ns, key, params) => {
        const originalText = original(ns, key, params)
        if (key === 'brand.localBuild') return 'Weave'
        if (ns === 'settings' && key === 'developerTools.description') {
          return /[\u3400-\u9fff]/.test(originalText) ? '开启后，显示执行轨迹与本轮代码差异' : 'Shows execution trajectory and code diffs'
        }
        if (key === 'fontSize.text.description') {
          return /[\u3400-\u9fff]/.test(originalText) ? '调整界面与会话正文字号（默认 16px）' : 'Adjusts interface and conversation font size (default 16px)'
        }
        if (ns === 'sidebar' && (key === 'session.new' || key === 'session.new.label')) return globalRow()?.name || 'Weave'
        if (ns === 'conversation') {
          if (key === 'workspace.defaultName') return globalRow()?.name || 'Weave'
          if (!['hero.headline', 'hero.preview', 'placeholder.hero'].includes(key)) return originalText
          const room = currentRow()
          if (key === 'hero.headline') return room?.scope === 'global' || !room ? (globalRow()?.name || 'Weave') : room.name
          if (key === 'hero.preview') return ''
          if (key === 'placeholder.hero' && /[\u3400-\u9fff]/.test(originalText)) return room?.scope === 'global' || !room
            ? '和助手聊聊你的研究…' : '在这个项目里继续讨论…'
        }
        if (!['workspace', 'schedule.manager'].includes(ns)) return originalText
        const cn = /[\u3400-\u9fff]/.test(originalText)
        if (key === 'workspace.defaultName' || key === 'host.defaultProject') return rows.find(r => r.scope === 'global')?.name || originalText
        if (key === 'section.workspaces' && (cn || originalText === 'Workspaces')) return cn ? '工作区' : 'Workspaces'
        if (key === 'workspace.add' && (cn || /^add workspace$/i.test(originalText))) return cn ? '创建科研项目' : 'Create research project'
        return originalText
      }), 'LabWeave project labels')
      ctx.effect(() => {
        const filterSlots = (entriesFn, name, ...rest) => {
          const list = entriesFn(name, ...rest)
          if (name === 'sidebar.panellist') return list.filter(e => !['plugins', 'schedules'].includes(e.options?.id) && !String(e.options?.id || '').startsWith('__lw_sync'))
          if (name === 'settings.section') return list.filter(e => !['agent-presets', 'plugins', 'plugin-manager'].includes(e.options?.id) && !String(e.options?.id || '').startsWith('__lw_sync'))
          if (name === 'settings.general.item') {
            return list.filter(e => {
              const id = String(e.options?.id || '')
              const locale = String(e.options?.locale || '')
              return !id.startsWith('__lw_sync') && id !== 'performance-usage' && !/session[-_]?log|sessionlog/i.test(id + ' ' + locale)
            })
          }
          if (name === 'settings.action' || name === 'sidebar.right.tab.guide.actions') return []
          if (name === 'sidebar.panellist.actions' || name === 'conversation.session.header.views.actions') {
            return list.filter(e => e.options?.id !== 'entry-customization' && !String(e.options?.id || '').startsWith('__lw_sync'))
          }
          if (name === 'conversation.input.model.options' || name === 'conversation.session.header.actions.subagent.footer') {
            return list.filter(e => e.options?.id !== 'agent-team' && !String(e.options?.id || '').startsWith('__lw_sync'))
          }
          if (name === 'conversation.chat.commandview') {
            return list.filter(e => e.options?.key !== 'team' && !String(e.options?.id || '').startsWith('__lw_sync'))
          }
          if (name === 'shell.overlay') {
            return list.filter(e => e.options?.id !== 'agent-team.disable' && !String(e.options?.id || '').startsWith('__lw_sync'))
          }
          if (name === 'plugins.add.actions') return list.filter(e => e.options?.id !== 'create-plugin')
          return list
        }
        const restoreA = wrap(ctx.slots, 'entries', filterSlots)
        const restoreB = typeof ctx.slots.entriesOfSlot === 'function' ? wrap(ctx.slots, 'entriesOfSlot', filterSlots) : () => {}
        const restoreCore = ctx.slots._core && typeof ctx.slots._core.entries === 'function'
          ? wrap(ctx.slots._core, 'entries', filterSlots) : () => {}
        const restoreCoreSlot = ctx.slots._core && typeof ctx.slots._core.entriesOfSlot === 'function'
          ? wrap(ctx.slots._core, 'entriesOfSlot', filterSlots) : () => {}
        const bump = slotName => {
          let dispose
          const stop = ctx.slots.inject(slotName, () => {
            dispose = ctx.slots.register({ name: slotName, id: '__lw_sync_' + slotName.replace(/\W+/g, '_'), order: 999, label: '' }, () => null)
            dispose()
            return () => {}
          })
          stop()
        }
        for (const name of ['settings.action', 'settings.section', 'settings.general.item', 'sidebar.panellist', 'sidebar.right.tab.guide.actions', 'conversation.session.header.views.actions', 'conversation.input.model.options', 'conversation.session.header.actions.subagent.footer', 'conversation.chat.commandview']) bump(name)
        const hideSettingsRows = () => {
          const host = document.querySelector('[data-shortcut-modal="settings"] [data-slot="settings.general.item"]')
          if (host) {
            for (const row of host.children) {
              if (/性能与用量|Performance\s*&\s*usage|Session Log|セッションログ/i.test(row.textContent || '') && row.dataset.lwHidden !== '1') {
                row.dataset.lwHidden = '1'
              }
            }
          }
          for (const slotHost of document.querySelectorAll('[data-slot="conversation.input.model.options"], [data-slot="conversation.session.header.actions.subagent.footer"], [data-slot="conversation.chat.commandview"]')) {
            for (const row of slotHost.children) {
              if (/智能体团队协作|agent\s*team|任务板|task\s*board/i.test(row.textContent || '') && row.dataset.lwHidden !== '1') {
                row.dataset.lwHidden = '1'
              }
            }
          }
        }
        const settingsObserver = new MutationObserver(hideSettingsRows)
        settingsObserver.observe(document.body, { childList: true, subtree: true })
        hideSettingsRows()
        return () => { settingsObserver.disconnect(); restoreA(); restoreB(); restoreCore(); restoreCoreSlot() }
      }, 'LabWeave hide panel & plugin clutter')
      ctx.effect(() => {
        const fontFlagKey = 'labweave.font-default.v1'
        const form = ctx.configForms?.get?.('ui-theme')
        const theme = ctx.theme
        if (!form || !theme) return () => {}
        let applied = false
        const upgradeDefaults = () => {
          if (applied) return
          const snap = form.getSnapshot()
          if (snap.status !== 'ready') return
          applied = true
          try { if (localStorage.getItem(fontFlagKey) === '1') return } catch {}
          const value = snap.value || {}
          if ((value.fontSize ?? 14) === 14 && (value.codeFontSize ?? 11) === 11 && (value.terminalFontSize ?? 13) === 13) {
            if (typeof theme.adjustFontSizes === 'function') theme.adjustFontSizes(2)
            else if (typeof theme.setFontSize === 'function') {
              theme.setFontSize('text', 16); theme.setFontSize('code', 13); theme.setFontSize('terminal', 15)
            }
          }
          try { localStorage.setItem(fontFlagKey, '1') } catch {}
        }
        const off = form.subscribe(upgradeDefaults)
        upgradeDefaults()
        return off
      }, 'LabWeave font defaults')
      ctx.effect(() => {
        const style = document.createElement('style'); style.textContent = styles; document.head.appendChild(style)
        const names = () => { if (!disposed) refresh().catch(() => {}) }
        window.addEventListener(nameChanged, names)
        window.addEventListener(profileChanged, names)
        let updateTimer, catalogTimer
        const offSessions = ctx.sessions.list.subscribe(() => {
          clearTimeout(updateTimer)
          updateTimer = setTimeout(() => { names(); window.dispatchEvent(new Event(updated)) }, 300)
        })
        const offWorkspaces = ctx.workspaces.list.subscribe(() => {
          clearTimeout(catalogTimer)
          catalogTimer = setTimeout(names, 350)
        })
        const brandTitle = () => {
          const title = document.title
          const branded = title.replace(/(^| — )DeepSeek Harness$/, '$1Weave')
          if (title !== branded) document.title = branded
        }
        const titleObserver = new MutationObserver(brandTitle)
        titleObserver.observe(document.head.querySelector('title'), { subtree: true, childList: true, characterData: true })
        brandTitle()
        return () => {
          disposed = true; nameStrings?.(); titleObserver.disconnect(); style.remove()
          window.removeEventListener(nameChanged, names); window.removeEventListener(profileChanged, names)
          offSessions(); offWorkspaces(); clearTimeout(updateTimer); clearTimeout(catalogTimer)
        }
      }, 'LabWeave appearance')

      const slot = (name, options, component) => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component))
      slot('conversation.input.dock', { id: 'labweave-messenger', order: 12, inject: sessionId => ({ sessionId }) }, ({ sessionId }) => {
        useNav()
        const workspace = useStore(ctx.workspaces.list).items.find(w => w.sessionIds.includes(sessionId))
        if (!workspace || !rows.some(r => r.workspaceId === workspace.workspaceId && r.scope === 'global')) return null
        const scope = '[data-conversation-session="' + CSS.escape(sessionId) + '"]'
        return h(React.Fragment, null,
          h('style', { 'data-lw-messenger': sessionId }, scope + ' [data-streaming="true"]{display:none!important}'),
          h(ConversationReceipts, { key: sessionId, sessionId }))
      })
      const BrandMark = ({ size }) => h('img', {
        src: './labweave-orbit.svg', alt: '', 'aria-hidden': true, draggable: false,
        width: size, height: size, className: 'lw-brand-mark',
      })
      function GlobalHeroEntry({ size }) {
        useNav()
        useStore(ctx.sessions.list)
        useStore(ctx.workspaces.list)
        const room = currentRow()
        if (room && room.scope !== 'global') return h(BrandMark, { size })
        const g = globalRow()
        const displayName = g?.name || 'Weave'
        const hasCustomAvatar = Boolean(g?.hasCustomAvatar && g?.avatar)
        const avatarSrc = hasCustomAvatar ? g.avatar : './labweave-orbit.svg'
        const tagline = g?.tagline || ''
        return h('button', {
          type: 'button',
          className: 'lw-hero-profile-entry',
          'aria-label': `设置全局助手 ${displayName} 资料`,
          title: '点击设置助手头像与资料',
          onClick: () => window.dispatchEvent(new CustomEvent(openProfileEvent)),
        },
          h('span', { className: 'lw-hero-avatar-frame', 'data-custom': hasCustomAvatar ? 'true' : 'false' },
            h('img', {
              src: avatarSrc, alt: '', 'aria-hidden': true, draggable: false,
              className: 'lw-brand-mark lw-hero-avatar-img',
            }),
            h('span', { className: 'lw-hero-avatar-badge', 'aria-hidden': true }, h(Icon, { name: 'edit' }))),
          h('span', { className: 'lw-hero-entry-name' }, displayName),
          tagline && h('span', { className: 'lw-hero-entry-tagline' }, tagline))
      }
      slot('sidebar.brand.mark', { priority: -30 }, BrandMark)
      slot('conversation.hero.brand.mark', { priority: -30 }, GlobalHeroEntry)
      slot('conversation.hero.frame', { id: 'pixel-whale', priority: -30 }, ({ children }) => children)
      slot('conversation.hero.agentPreset', { priority: -30 }, () => null)
      slot('conversation.session.header.actions', { id: 'agent-preset', priority: -30, order: -10 }, () => null)
      slot('plugins.add.actions', { id: 'create-plugin', priority: -30 }, () => null)
      const picker = props => props.open ? h(ProjectForm, { ...props, refresh }) : null
      slot('conversation.hero.workspace.directoryFlow', { priority: -20 }, picker)
      slot('sidebar.brand.name', { priority: -30 }, () => {
        const rev = useNav(), ref = React.useRef(null)
        const panel = useStore(ctx.layout.panelInfo)
        useStore(ctx.sessions.list)
        useStore(ctx.workspaces.list)
        const globalName = globalRow()?.name || 'Weave'
        const active = !panel.activePanelId && (!currentRow() || currentRow()?.scope === 'global')
        React.useLayoutEffect(() => {
          const btn = ref.current?.closest('button')
          if (!btn) return
          btn.setAttribute('aria-label', globalName)
          btn.removeAttribute('title')
        }, [rev, globalName])
        return h('span', { ref, className: 'lw-brand-entry' },
          h('span', { className: 'lw-wordmark' }, 'Weave'),
          h('span', { className: 'lw-brand-assistant', 'data-active': active ? 'true' : 'false', 'aria-hidden': true }, '打开助理'))
      })

      const tool = (name, label, onClick, className = '') => h('button', { type: 'button',
        className: className ? 'lw-tool ' + className : 'lw-tool', 'aria-label': label, title: label, onClick }, h(Icon, { name }))
      function closeDrawer() {
        if (document.querySelector('[data-sidebar-drawer]:not([data-sidebar-collapsed])')) ctx.layout.toggleSidebar()
      }
      function openPage(row, feature) {
        if (feature === 'chat') {
          openProjectChatSession(row, { clearSplit: true })
          closeDrawer()
          return
        }
        selectPage(row.workspaceId, feature); closeDrawer()
      }
      function startProjectChat(row) { forgetPage(); nav.startSession(row.workspaceId); closeDrawer(); changed() }
      function jump(id) { openChat(id); closeDrawer() }

      function ProjectBranch({ row, sessions, activePage, current, filter, onRenameChat, onDeleteChat, onRenameFeature, onDeleteFeature }) {
        const { value, error } = useProject(row.workspaceId, 'navigation')
        const [chatsOpen, setChatsOpen] = React.useState(true)
        const featureList = projectFeatures(row, value)
        const labels = value?.labels || Object.fromEntries(featureList.map(f => [f.id, f.label]))
        const hidden = allBotSessionIds(value)
        const visibleSessions = sessions.filter(s => !hidden.has(s.id))
        const matches = visibleSessions.filter(s => !filter || chatTitle(s).toLocaleLowerCase().includes(filter))
        const entry = (id, text, icon, click, active, extra = {}) => h('button', { type: 'button', className: 'lw-row-main',
          'aria-current': active ? 'page' : undefined, ...extra, onClick: click }, h(Icon, { name: icon }), h('span', null, text))
        return h('nav', { className: 'lw-tier', 'aria-label': row.name + ' 项目功能' },
          featureList.map(feat => {
            const id = feat.id
            const label = labels[id] || feat.label || features[id] || id
            return h(React.Fragment, { key: id },
              h('div', { className: 'lw-row' }, entry(id, label, feat.symbol || featureIcon(id), () => {
                if (id === 'chat') {
                  if (matches.length > 0) setChatsOpen(prev => !prev)
                  else setChatsOpen(true)
                  if (!current || chatSplit) {
                    const targetId = current || recentSessionFor(row.workspaceId, visibleSessions)?.id
                    return targetId ? jump(targetId) : startProjectChat(row)
                  }
                  return
                }
                openPage(row, id)
              }, activePage === id || (id === 'chat' && !!current) || splitPanes.some(p => p.workspaceId === row.workspaceId && p.feature === id),
              id === 'chat' && matches.length > 0 ? { 'aria-expanded': chatsOpen, title: chatsOpen ? '点击收起对话历史' : '点击展开对话历史' } : {}),
              h('span', { className: 'lw-row-tools' },
                id === 'chat' && tool('plus', '在' + row.name + '中新建对话', () => { setChatsOpen(true); startProjectChat(row) }),
                onRenameFeature && tool('edit', '重命名功能 ' + label, () => onRenameFeature(row, feat, label)),
                id!=='chat' && onDeleteFeature && tool('trash','删除功能 '+label,()=>onDeleteFeature(row,feat,label),'lw-tool-danger'),
                tool('split', '分屏打开' + label, () => splitPage(row, id)))),
              id === 'chat' && (chatsOpen || Boolean(filter)) && matches.length > 0 && h('div', { className: 'lw-sessions', 'aria-label': row.name + ' 对话' },
                matches.map(s => h('div', { className: 'lw-row', key: s.id },
                  h('button', { type: 'button', className: 'lw-row-main', 'aria-current': current === s.id ? 'page' : undefined,
                    onClick: () => jump(s.id) }, h('span', null, chatTitle(s))),
                  h('span', { className: 'lw-row-tools' },
                    tool('edit', '重命名对话 ' + chatTitle(s), () => onRenameChat(s)),
                    tool('trash', '删除对话 ' + chatTitle(s), () => onDeleteChat(row, s), 'lw-tool-danger'))))))
          }),
          error && h('small', { role: 'alert' }, error))
      }

      const renameSessionById = async (sessionId, title) => {
        const result = await ctx.sessions.using(sessionId, { source: 'workspaceOperation' }, ref => ref.binding.session.rename(title))
        if (result && result.ok === false) throw Error(result.error?.message || '重命名对话失败。')
      }
      const removeSessionInRow = async (row, sessionId) => {
        await ctx.uiWorkspace.archiveSession(sessionId, { stopActivity: true })
        if (currentSession()?.id === sessionId) {
          const remaining = historySessionsFor(row.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot(), allBotSessionIds())
            .filter(s => s.id !== sessionId)
          if (remaining.length) jump(remaining[0].id)
          else if (row.scope === 'global') { forgetPage(); nav.startSession(row.workspaceId); changed() }
          else await nav.openWorkspace(row.workspaceId)
        }
        window.dispatchEvent(new Event(updated))
      }
      function SessionActionDialog({ dialog, onCancel }) {
        const [title, setTitle] = React.useState(dialog?.session?.title?.trim() || '')
        const [busy, setBusy] = React.useState(false)
        const [err, setErr] = React.useState('')
        React.useEffect(() => {
          setTitle(dialog?.session?.title?.trim() || '')
          setBusy(false)
          setErr('')
        }, [dialog?.type, dialog?.session?.id])
        const close = () => { if (!busy) onCancel() }
        if (dialog?.type === 'rename-session') {
          return h(Dialog, { title: '重命名对话', close }, h('form', {
            className: 'lw-form',
            onSubmit: async e => {
              e.preventDefault(); if (busy || !title.trim()) return
              setBusy(true); setErr('')
              try { await renameSessionById(dialog.session.id, title.trim()); onCancel() }
              catch (error) { setErr(error.message); setBusy(false) }
            },
          },
          h('label', null, '对话标题', h('input', { required: true, autoFocus: true, value: title, maxLength: 120, onChange: e => setTitle(e.target.value) })),
          err && h('p', { role: 'alert' }, err),
          h('div', { className: 'lw-actions' }, Btn({ variant: 'primary', type: 'submit', disabled: busy }, '保存'), Btn({ variant: 'ghost', onClick: close, disabled: busy }, '取消'))))
        }
        if (dialog?.type === 'delete-session') {
          return h(Dialog, { title: '删除对话', close }, h('div', { className: 'lw-form' },
            h('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } },
              `确定移除对话「${chatTitle(dialog.session)}」吗？`),
            err && h('p', { role: 'alert' }, err),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'primary', disabled: busy, onClick: async () => {
                setBusy(true); setErr('')
                try { await removeSessionInRow(dialog.row, dialog.session.id); onCancel() }
                catch (error) { setErr(error.message); setBusy(false) }
              } }, busy ? '删除中…' : '确认删除'),
              Btn({ variant: 'ghost', onClick: close, disabled: busy }, '取消'))))
        }
        return null
      }

      function ResearchTree({ wide, expandSidebar }) {
        useNav()
        const workspace = useStore(ctx.workspaces.list), sessions = useStore(ctx.sessions.list), panel = useStore(ctx.layout.panelInfo)
        const [expanded, setExpanded] = React.useState({})
        const [filter, setFilter] = React.useState(null)
        const [dialog, setDialog] = React.useState()
        const [rename, setRename] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [err, setErr] = React.useState('')
        const current = Object.values(sessions.byId).find(s => s.retainedBy.mainView > 0)
        const selected = panel.activePanelId === pageKey ? choice : null
        React.useEffect(() => {
          if (initialNavigation || !globalRow() || sessions.phase !== 'ready' || workspace.phase !== 'ready') return
          initialNavigation = true
          if (choice && sessionStorage.getItem(selectionKey) && choice.feature !== 'chat' && rows.some(r => r.workspaceId === choice.workspaceId))
            return selectPage(choice.workspaceId, choice.feature)
          if (!current && !panel.activePanelId) nav.startSession()
        }, [revision, sessions.phase, workspace.phase, current, panel.activePanelId])
        React.useEffect(() => {
          if (selected?.workspaceId) setExpanded(prev => ({ ...prev, [selected.workspaceId]: true }))
        }, [selected?.workspaceId])
        const q = filter?.trim().toLocaleLowerCase() || ''
        function close() { if (!busy) { setDialog(undefined); setErr('') } }
        function created(row) {
          close()
          setExpanded(prev => ({ ...prev, [row.workspaceId]: true }))
          startProjectChat(row)
        }
        const [flyout, setFlyout] = React.useState(null)
        const railRef = React.useRef(null)
        const flyoutRef = React.useRef(null)
        React.useEffect(() => {
          if (wide) { setFlyout(null); return }
          if (!flyout) return
          const onDoc = e => {
            if (flyoutRef.current?.contains(e.target) || railRef.current?.contains(e.target)) return
            setFlyout(null)
          }
          const onKey = e => { if (e.key === 'Escape') setFlyout(null) }
          document.addEventListener('pointerdown', onDoc)
          document.addEventListener('keydown', onKey)
          return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
        }, [wide, flyout])
        const removeProject = async row => {
          const members = sessionsFor(row.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot(), allBotSessionIds())
          const viewingDeleted = selected?.workspaceId === row.workspaceId || members.some(s => s.id === current?.id)
          await ctx.workspaces.delete(row.workspaceId)
          if (viewingDeleted) {
            forgetPage()
            const g = globalRow()
            if (g) await nav.openWorkspace(g.workspaceId)
            else nav.startSession()
          }
        }
        const dialogs = h(React.Fragment, null,
          dialog?.type==='delete-bot' && h(Dialog,{title:'删除功能 Bot',close},h('div',{className:'lw-form'},
            h('p',null,'从「'+dialog.row.name+'」移除「'+dialog.label+'」并撤销分配给它的任务？项目文件和已有记录会保留。'),
            err&&h('p',{role:'alert'},err),h('div',{className:'lw-actions'},
              Btn({variant:'danger',disabled:busy,onClick:async()=>{
                if(busy)return
                setBusy(true);setErr('')
                try {
                  await project(dialog.row.workspaceId,'remove_feature_bot',{featureId:dialog.featureId})
                  await refresh()
                  if(splitPanes.some(p=>p.workspaceId===dialog.row.workspaceId&&p.feature===dialog.featureId))closePane({workspaceId:dialog.row.workspaceId,feature:dialog.featureId})
                  window.dispatchEvent(new Event(updated));setDialog(undefined)
                }catch(e){setErr(e.message)}finally{setBusy(false)}
              }},busy?'删除中…':'确认删除'),Btn({variant:'ghost',disabled:busy,onClick:close},'取消')))),
          dialog?.type === 'create-bot' && h(CreateFeatureBot,{row:dialog.row,close,created:async(row,feat)=>{
            await refresh();window.dispatchEvent(new Event(updated));setDialog(undefined)
            setExpanded(prev=>({...prev,[row.workspaceId]:true}));setFilter(null);openPage(row,feat.id)
          }}),
          dialog?.type === 'create' && h(ProjectForm, { refresh, onCreated: created, onCancel: close }),
          dialog?.type === 'rename' && h(Dialog, { title: '重命名项目', close }, h('form', { className: 'lw-form',
            onSubmit: async e => {
              e.preventDefault(); if (busy || !rename.trim()) return
              setBusy(true); setErr('')
              try { await ctx.workspaces.rename(dialog.row.workspaceId, rename); setBusy(false); setDialog(undefined) }
              catch (error) { setErr(error.message); setBusy(false) }
            } },
            h('label', null, '项目名称', h('input', { required: true, autoFocus: true, value: rename, maxLength: 80, onChange: e => setRename(e.target.value) })),
            err && h('p', { role: 'alert' }, err),
            h('div', { className: 'lw-actions' }, Btn({ variant: 'primary', type: 'submit', disabled: busy }, '保存'), Btn({ variant: 'ghost', onClick: close, disabled: busy }, '取消')))),
          dialog?.type === 'delete-project' && h(Dialog, { title: '删除项目', close }, h('div', { className: 'lw-form' },
            h('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } },
              `确定将「${dialog.row.name}」从科研项目列表中移除吗？本地项目文件会保留，运行中的实验需先停止。`),
            err && h('p', { role: 'alert' }, err),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'primary', disabled: busy, onClick: async () => {
                setBusy(true); setErr('')
                try { await removeProject(dialog.row); setBusy(false); setDialog(undefined) }
                catch (error) { setErr(error.message); setBusy(false) }
              } }, busy ? '删除中…' : '确认删除'),
              Btn({ variant: 'ghost', onClick: close, disabled: busy }, '取消')))),
          (dialog?.type === 'rename-session' || dialog?.type === 'delete-session') && h(SessionActionDialog, { dialog, onCancel: close }),
          dialog?.type === 'rename-feature' && h(FeatureRenameDialog, {
            workspaceId: dialog.row.workspaceId, projectName: dialog.row.name,
            featureId: dialog.featureId, currentLabel: dialog.label,
            onSaved: refresh, onCancel: close,
          }),
          dialog?.type === 'project-memory' && h(ProjectMemoryDialog, {
            row: dialog.row, close,
          }))
        const hiddenSessions = allBotSessionIds()
        const projectRows = rows.filter(r => r.scope !== 'global')
        if (!wide) {
          const flyRow = flyout && projectRows.find(r => r.workspaceId === flyout.id)
          const flyMembers = flyRow ? historySessionsFor(flyRow.workspaceId, workspace, sessions, hiddenSessions) : []
          const flyInside = flyRow && !panel.activePanelId && sessionsFor(flyRow.workspaceId, workspace, sessions, hiddenSessions).some(s => s.id === current?.id)
          const openFlyout = (id, ev) => {
            const rect = ev.currentTarget.getBoundingClientRect()
            setFlyout(prev => prev?.id === id ? null : { id, top: Math.max(12, Math.min(rect.top, window.innerHeight - 360)) })
          }
          return h(React.Fragment, null,
            h('nav', { ref: railRef, className: 'lw-rail', 'aria-label': '科研项目快捷栏' },
              !projectRows.length
                ? h('button', {
                    type: 'button', className: 'lw-rail-btn', 'aria-label': '科研项目', title: '科研项目',
                    'aria-expanded': flyout?.id === '__empty__', onClick: e => openFlyout('__empty__', e),
                  }, h(Icon, { name: 'folder' }))
                : projectRows.map(row => {
                    const id = row.workspaceId
                    const allMembers = sessionsFor(id, workspace, sessions, hiddenSessions)
                    const inside = !panel.activePanelId && allMembers.some(s => s.id === current?.id)
                    const active = selected?.workspaceId === id || inside
                    return h('button', {
                      key: id, type: 'button', className: 'lw-rail-btn',
                      'aria-label': row.name, title: row.name,
                      'aria-expanded': flyout?.id === id,
                      'data-active': active ? 'true' : 'false',
                      onClick: e => openFlyout(id, e),
                    }, h(Icon, { name: 'folder' }))
                  }),
              h('button', {
                type: 'button', className: 'lw-rail-btn', 'aria-label': '创建科研项目', title: '创建科研项目',
                onClick: () => { setFlyout(null); setDialog({ type: 'create' }) },
              }, h(Icon, { name: 'plus' }))),
            flyout && ReactDOM.createPortal(
              h('div', {
                ref: flyoutRef, className: 'lw-rail-popover', role: 'dialog',
                'aria-label': flyRow ? flyRow.name + ' 项目菜单' : '科研项目菜单',
                style: { top: flyout.top },
                onClick: e => {
                  const btn = e.target.closest('button')
                  if (btn && btn.closest('.lw-tier')) setFlyout(null)
                },
              },
                flyRow ? h(React.Fragment, null,
                  h('div', { className: 'lw-rail-popover-head' },
                    h('strong', null, flyRow.name),
                    h('span', { className: 'lw-actions', style: { gap: 2 } },
                      tool('plus', '在'+flyRow.name+'创建功能 Bot', () => {setFlyout(null);setDialog({type:'create-bot',row:flyRow})}),
                      tool('edit', '重命名' + flyRow.name, () => { setFlyout(null); setRename(flyRow.name); setDialog({ type: 'rename', row: flyRow }) }),
                      tool('trash', '删除' + flyRow.name, () => { setFlyout(null); setDialog({ type: 'delete-project', row: flyRow }) }, 'lw-tool-danger'),
                      tool('close', '关闭菜单', () => setFlyout(null)))),
                  h(ProjectBranch, {
                    row: flyRow, sessions: flyMembers, activePage: selected?.workspaceId === flyRow.workspaceId && selected.feature,
                    current: flyInside && !current.blank && current.id, filter: '',
                    onRenameChat: s => { setFlyout(null); setRename(s.title?.trim() || ''); setDialog({ type: 'rename-session', session: s }) },
                    onDeleteChat: (owner, s) => { setFlyout(null); setDialog({ type: 'delete-session', row: owner, session: s }) },
                    onRenameFeature: (owner, feat, label) => { setFlyout(null); setDialog({ type: 'rename-feature', row: owner, featureId: feat.id, label }) },
                    onDeleteFeature: (owner,feat,label)=>{setFlyout(null);setErr('');setDialog({type:'delete-bot',row:owner,featureId:feat.id,label})},
                  }))
                  : h(React.Fragment, null,
                    h('div', { className: 'lw-rail-popover-head' },
                      h('strong', null, '科研项目'),
                      tool('close', '关闭菜单', () => setFlyout(null))),
                    h('p', { className: 'lw-hint' }, '还没有科研项目，先创建一个课题空间。'),
                    Btn({ variant: 'primary', size: 'sm', onClick: () => { setFlyout(null); setDialog({ type: 'create' }) } }, '+ 创建科研项目'),
                    Btn({ variant: 'ghost', size: 'sm', onClick: () => { setFlyout(null); nav.startSession() } }, '回到全局助手 ' + (globalRow()?.name || 'Weave')))),
              document.body),
            dialogs)
        }
        return h('section', { className: 'lw-tree', 'aria-label': '工作区' },
          h('header', { className: 'lw-tree-head' }, h('span', null, '工作区'),
            tool('search', '搜索科研项目和对话', () => setFilter(filter === null ? '' : null)),
            tool('plus', '创建科研项目', () => setDialog({ type: 'create' }))),
          filter !== null && h('label', { className: 'lw-query' }, h('input', { type: 'search', autoFocus: true,
            'aria-label': '搜索项目和对话', placeholder: '搜索项目和对话', value: filter, onChange: e => setFilter(e.target.value) })),
          projectRows.map(row => {
            const id = row.workspaceId
            const allMembers = sessionsFor(id, workspace, sessions, hiddenSessions)
            const historyMembers = allMembers.filter(s => !s.blank)
            const inside = !panel.activePanelId && allMembers.some(s => s.id === current?.id)
            const matchesName = row.name.toLocaleLowerCase().includes(q)
            if (!matchesName && !historyMembers.some(s => chatTitle(s).toLocaleLowerCase().includes(q))) return null
            const open = q ? true : (expanded[id] ?? (choice?.workspaceId === id || inside))
            return h('div', { key: id }, h('div', { className: 'lw-row' },
              h('button', { className: 'lw-row-main', type: 'button', 'aria-expanded': !!open,
                onClick: () => setExpanded(prev => ({ ...prev, [id]: !open })) },
                h(Icon, { name: open ? 'down' : 'right' }), h(Icon, { name: 'folder' }), h('span', null, row.name)),
              h('span', {className:'lw-row-tools'}, tool('plus', '在'+row.name+'创建功能 Bot',()=>setDialog({type:'create-bot',row}))),
              open && h('span', { className: 'lw-row-tools' },
                tool('memory', '管理' + row.name + '长期记忆', () => setDialog({ type: 'project-memory', row })),
                tool('edit', '重命名' + row.name, () => { setRename(row.name); setDialog({ type: 'rename', row }) }),
                tool('trash', '删除' + row.name, () => setDialog({ type: 'delete-project', row }), 'lw-tool-danger'))),
              open && h(ProjectBranch, {
                row, sessions: historyMembers, activePage: selected?.workspaceId === id && selected.feature,
                current: inside && !current.blank && current.id, filter: matchesName ? '' : q,
                onRenameChat: s => { setRename(s.title?.trim() || ''); setDialog({ type: 'rename-session', session: s }) },
                onDeleteChat: (owner, s) => setDialog({ type: 'delete-session', row: owner, session: s }),
                onRenameFeature: (owner, feat, label) => setDialog({ type: 'rename-feature', row: owner, featureId: feat.id, label }),
                onDeleteFeature: (owner,feat,label)=>{setErr('');setDialog({type:'delete-bot',row:owner,featureId:feat.id,label})},
              }))
          }),
          !projectRows.length && h('button', {
            type: 'button', className: 'lw-sidebar-empty-btn',
            onClick: () => setDialog({ type: 'create' }),
          }, h(Icon, { name: 'plus' }), h('span', null, '创建第一个项目')),
          dialogs)
      }
      slot('sidebar.workspaces', { priority: -25 }, ResearchTree)

      function ProjectMapDrawer({ row, value, close }) {
        const rails = value?.rails || {}
        const featureList = projectFeatures(row, value).filter(f => f.id !== 'chat')
        const jumpRail = rail => { close(); openPage(row, rail) }
        return h('section', { style: { display: 'grid', gap: 12 }, 'aria-label': '课题关系总览' },
          h('div', { className: 'lw-map-lanes' },
            featureList.map(feat => {
              const rail = feat.id
              const list = rails[rail] || []
              return h('div', { key: rail, className: 'lw-map-lane' },
                h('button', { type: 'button', className: 'lw-map-lane-btn', style: { fontWeight: 600, display: 'flex', justifyContent: 'space-between' },
                  onClick: () => jumpRail(rail) }, h('span', null, feat.label), h('span', { className: 'lw-num lw-hint' }, list.length)),
                !list.length ? h('span', { className: 'lw-hint', style: { padding: '2px 6px' } }, '暂无条目')
                  : list.slice(-4).reverse().map((item, idx) => h('button', { key: item.id || idx, type: 'button', className: 'lw-map-lane-btn',
                    title: item.text, onClick: () => jumpRail(rail) }, item.text)))
            })),
          h('div', { className: 'lw-actions', style: { justifyContent: 'flex-end' } },
            Btn({ variant: 'secondary', size: 'sm', onClick: close }, '关闭')))
      }

      const featureHints = {
        feed: '前沿追踪 · 订阅推送',
        ideas: '灵感假设 · 目标转化',
        goals: '里程碑 · 实验追踪',
        library: '文献 · 仓库 · 产物',
      }
      const featureEmpties = {
        feed: '还没有收到任何动态推送',
        ideas: '还没有收集任何点子',
        goals: '还没有设定任何目标',
        library: '还没有收录任何资源',
      }

      function useFeatureBot(row, feature, featMeta, value) {
        const sid = featMeta?.botSessionId && ctx.sessions.list.getSnapshot().byId[featMeta.botSessionId]
          ? featMeta.botSessionId : null
        const [eventsState, setEventsState] = React.useState({ messages: [], running: false, status: '', error: '' })
        const [sending, setSending] = React.useState(false)

        React.useEffect(() => {
          if (!sid) {
            setEventsState({ messages: [], running: false, status: '', error: '' })
            return
          }
          localBotSessions.add(sid)
          let disposed = false
          let ref
          const offs = []
          let lastToolSeq = 0
          const parse = () => {
            if (disposed || !ref?.binding) return
            const snap = ref.binding.eventSource?.getSnapshot?.()
            const sessSnap = ref.binding.session?.getSnapshot?.()
            const entries = snap?.entries || []
            const messages = []
            const calls = new Map()
            let newestToolSeq = lastToolSeq
            for (const rec of entries) {
              const ev = rec?.event
              if (!ev) continue
              if (ev.type === 'user/message') {
                const raw = ev.data?.message?.content ?? ev.data?.content ?? []
                const text = Array.isArray(raw)
                  ? raw.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n')
                  : (typeof raw === 'string' ? raw : '')
                if (text.trim()) messages.push({ id: 'u-' + ev.seq, role: 'user', text: text.trim(), time: ev.time })
              } else if (ev.type === 'assistant/message') {
                const raw = ev.data?.message?.content ?? []
                const text = Array.isArray(raw) ? raw.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n') : ''
                if (text.trim()) messages.push({ id: 'a-' + ev.seq, role: 'assistant', text: text.trim(), time: ev.time })
              } else if (ev.type === 'turn/start' || ev.type === 'turn/end') {
                calls.clear()
              } else if (ev.type === 'tool/call') {
                calls.set(ev.data.callId, ev.data.name)
              } else if (ev.type === 'tool/result') {
                calls.delete(ev.data.message?.toolCallId)
                newestToolSeq = Math.max(newestToolSeq, ev.seq)
              }
            }
            if (newestToolSeq > lastToolSeq) {
              lastToolSeq = newestToolSeq
              window.dispatchEvent(new Event(updated))
              refresh().catch(() => {})
            }
            const tool = Array.from(calls.values()).pop() || ''
            const status = tool === 'labweave_sandbox_run' ? '正在提交试跑…' :
              /search|lookup/.test(tool) ? '正在查找资料…' : tool ? '正在使用工具…' : ''
            const errMsg = sessSnap?.promptError?.error?.message || sessSnap?.lastAgentError?.message || ''
            setEventsState({ messages, running: Boolean(sessSnap?.running), status, error: errMsg })
          }
          try {
            ref = ctx.sessions.retain(sid, { source: 'featureBot' })
            Promise.resolve(ref.ready).then(() => {
              if (disposed) return
              if (ref.binding?.eventSource?.subscribe) offs.push(ref.binding.eventSource.subscribe(parse))
              if (ref.binding?.session?.subscribe) offs.push(ref.binding.session.subscribe(parse))
              parse()
              window.dispatchEvent(new Event('labweave:model-updated'))
            }).catch(err => {
              if (!disposed) setEventsState(prev => ({ ...prev, error: err?.message || 'Bot 会话加载失败。' }))
            })
          } catch (err) {
            setEventsState(prev => ({ ...prev, error: err?.message || 'Bot 会话不可用。' }))
          }
          return () => {
            disposed = true
            offs.forEach(fn => fn?.())
            try { ref?.release?.() } catch {}
          }
        }, [sid])

        const ensureSession = async () => {
          if (sid) return sid
          const createdId = await ctx.sessions.create({ workspaceId: row.workspaceId })
          localBotSessions.add(createdId)
          await project(row.workspaceId, 'bot_session', { featureId: feature, sessionId: createdId })
          await refresh()
          window.dispatchEvent(new Event(updated))
          return createdId
        }

        const sendPrompt = async text => {
          const clean = String(text || '').trim()
          if (!clean || sending) return
          setSending(true)
          setEventsState(prev => ({ ...prev, error: '' }))
          try {
            const targetSid = await ensureSession()
            await ctx.sessions.using(targetSid, { source: 'featureBot' }, async ref => {
              await Promise.resolve(ref.ready).catch(() => {})
              await ensureSessionRoutableModel(targetSid, ref)
              const res = await ref.binding.session.prompt([{ type: 'text', text: clean }], 'queue')
              if (res && res.ok === false) throw Error(res.error?.message || '发送失败，请检查模型设置。')
            })
          } catch (err) {
            setEventsState(prev => ({ ...prev, error: err?.message || '发送失败。' }))
            throw err
          } finally {
            setSending(false)
          }
        }

        return { ...eventsState, sessionId: sid, sending, sendPrompt }
      }

      function ProjectPage({ row, feature, paneIndex = 0, paneCount = 1 }) {
        const { value, error: loadError } = useProject(row.workspaceId)
        const featureList = projectFeatures(row, value)
        const featMeta = featureList.find(f => f.id === feature) || { id: feature, label: features[feature] || feature }
        const labels = value?.labels || Object.fromEntries(featureList.map(f => [f.id, f.label]))
        const title = labels[feature] || featMeta.label || features[feature] || feature
        const pane = { workspaceId: row.workspaceId, feature }
        const subtitle = featMeta.hint || featureHints[feature] || value?.description || `${title} · 分类推送`
        const emptyTitle = featMeta.emptyText || featureEmpties[feature] || `还没有收到来自「${title}」的推送内容`
        const persisted = paneStateFor(row.workspaceId, feature)
        const bot = useFeatureBot(row, feature, featMeta, value)
        return h('main', { className: 'lw-page', 'data-feature': feature, 'aria-label': row.name + ' · ' + title },
          h('div', { className: 'lw-page-topbar' },
            h('div', { className: 'lw-actions' },
              paneIndex === 0 && h('button', {
                type: 'button', className: 'lw-companion-btn', 'aria-pressed': !!chatSplit,
                'aria-label': chatSplit ? '收起项目聊天' : '展开项目聊天',
                title: chatSplit ? '收起左侧项目聊天' : '在侧栏与主区之间展开项目聊天',
                onClick: () => toggleCompanionChat(row),
              }, h(Icon, { name: 'chat' }), h('span', null, chatSplit ? '收起聊天' : '聊天'))),
            paneCount > 1 && h('div', { className: 'lw-actions' },
              h('button', {
                type: 'button', className: 'lw-pane-close',
                'aria-label': '关闭分栏 ' + title,
                title: '关闭分栏 ' + title,
                onClick: () => closePane(pane),
              }, h(Icon, { name: 'close' })))),
          h(Panel, {
            workspaceId: row.workspaceId, row, feature, featMeta, title, subtitle, emptyTitle,
            value, loadError, persisted, bot, openModels: () => openSettingsRef?.('models'), draft, onRenamed: refresh,
          }))
      }

      slot('main', { key: pageKey }, () => {
        useNav()
        const activePanes = (splitPanes.length ? splitPanes : (choice ? [choice] : []))
          .map(p => ({ ...p, row: rows.find(r => r.workspaceId === p.workspaceId && r.scope !== 'global') }))
          .filter(p => p.row && hasFeature(p.row, p.feature))
        if (!activePanes.length) return h('p', { className: 'lw-hint', style: { padding: 24 }, role: 'status' }, '请从侧栏选择科研项目。')
        const paneCount = activePanes.length + (chatSplit ? 1 : 0)
        if (activePanes.length === 1) {
          const p = activePanes[0]
          return h(ProjectPage, { key: p.workspaceId + ':' + p.feature, row: p.row, feature: p.feature, paneIndex: 0, paneCount })
        }
        return h('div', { className: 'lw-split-grid', 'aria-label': '分屏科研工作区' },
          activePanes.map((p, idx) => h(ProjectPage, { key: p.workspaceId + ':' + p.feature, row: p.row, feature: p.feature, paneIndex: idx, paneCount })))
      })

      const SandboxPanel = React.lazy(() => import(new URL('./labweave-sandbox-panel.js', document.baseURI).href)
        .then(module => ({default: module.createPanel(React, project, (row,sid)=>{
          const bot=row.features?.find(f=>f.botSessionId===sid)
          if(bot)selectPage(row.workspaceId,bot.id)
          else openChat(sid)
        })})))
      const sandboxEvents = new Map()
      function isSandboxChat(sid) {
        const row = currentRow()
        return !!sid && !!row && row.scope !== 'global' && currentSession()?.id === sid
          && ctx.layout.panelInfo.getSnapshot().activePanelId == null
          && !(chatSplit && splitPanes.length) && !allBotSessionIds().has(sid)
      }
      function hideActiveSandbox() {
        const sidebar = ctx.sidebarRight
        const sid = currentSession()?.id
        const active = sidebar?.active?.()
        if (!sid || !active) return
        if (active.kind === 'labweave-context') sidebar.hide(active.id)
        for (const tab of sidebar.openTabs?.getSnapshot() || []) {
          if (tab.sessionId === sid && tab.kind === 'labweave-context') sidebar.closeIn?.(sid, tab.tabId)
        }
      }
      function SandboxTab() {
        useNav()
        useStore(ctx.sessions.list)
        useStore(ctx.workspaces.list)
        useStore(ctx.layout.panelInfo)
        const current = currentRow(), sid = currentSession()?.id, event = sandboxEvents.get(sid)
        if (!isSandboxChat(sid) || !current || current.scope === 'global') return null
        return h(React.Suspense, { fallback: h('p', { className: 'lw-hint', role: 'status' }, '读取项目代码沙盒…') },
          h(SandboxPanel, { key: current.workspaceId, row: current, notice: event?.workspaceId === current.workspaceId ? event : null }))
      }
      function useSandboxNotifications(sid) {
        React.useEffect(()=>{
          if(!sid)return
          const ctrl=new AbortController()
          let timer
          const key='labweave.sandbox.last.'+sid
          async function check(){
            try{
              if(document.hidden)return
              const event=await api('sandbox-event',{sessionId:sid},ctrl.signal)
              if(ctrl.signal.aborted || !isSandboxChat(sid) || !event || Date.now()-event.at>120000 || event.eventId===sessionStorage.getItem(key))return
              sandboxEvents.set(sid,event)
              ctx.sidebarRight.openTabIn(sid,'labweave-context')
              ctx.sidebarRight.actionsFor?.(sid)?.setExpanded?.(sid,true)
              sessionStorage.setItem(key,event.eventId)
              changed()
            }catch{/* Retry naturally when the authenticated session reconnects. */}
            finally{if(!ctrl.signal.aborted)timer=setTimeout(check,1800)}
          }
          check()
          return ()=>{ctrl.abort();clearTimeout(timer)}
        },[sid])
      }

      if (ctx.sidebarRightTabs?.register) {
        const definition = {
          id: 'labweave-research-context',
          kind: 'labweave-context',
          priority: 'builtin',
          title: () => '项目代码沙盒',
          guide: [{
            id: 'labweave-context',
            order: 5,
            title: () => '项目代码沙盒',
            description: () => '使用本项目的 Python 环境运行对话中的实验，查看进程、日志和产物。',
          }],
        }
        ctx.effect(() => {
          let off, pending = false, disposed = false
          function sync() {
            if (pending || disposed) return
            pending = true
            queueMicrotask(() => {
              pending = false
              if (disposed) return
              if (isSandboxChat(currentSession()?.id)) {
                if (!off) off = ctx.sidebarRightTabs.register(definition)
              } else if (off) {
                hideActiveSandbox()
                off()
                off = undefined
              }
            })
          }
          const subs = [ctx.layout.panelInfo,ctx.sessions.list,ctx.workspaces.list].map(store => store.subscribe(sync))
          window.addEventListener(navEvent,sync)
          sync()
          return () => { disposed=true; window.removeEventListener(navEvent,sync); subs.forEach(unsubscribe=>unsubscribe()); off?.() }
        }, 'LabWeave chat sandbox visibility')
      }

      slot('sidebar.right.pane.tab.title', { key: 'labweave-research-context' }, () => h('span',null,'项目代码沙盒'))

      slot('sidebar.right.pane.tab', { key: 'labweave-research-context' }, SandboxTab)

      slot('conversation.header.leading', { id: 'labweave-global-sessions', priority: -20 }, () => {
        useNav()
        const workspaces = useStore(ctx.workspaces.list)
        const sessions = useStore(ctx.sessions.list)
        useStore(ctx.layout.panelInfo)
        const current = Object.values(sessions.byId).find(s => s.retainedBy.mainView > 0)
        const row = currentRow()
        const isGlobal = Boolean(current && row?.scope === 'global')
        const [open, setOpen] = React.useState(false)
        const [pos, setPos] = React.useState({ top: 48, left: 12 })
        const [sessionDialog, setSessionDialog] = React.useState(null)
        const triggerRef = React.useRef(null)
        const popoverRef = React.useRef(null)
        const placePopover = () => {
          const rect = triggerRef.current?.getBoundingClientRect()
          if (!rect) return
          setPos({
            top: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 280)),
            left: Math.max(12, Math.min(rect.left, window.innerWidth - 320)),
          })
        }
        React.useEffect(() => { setOpen(false) }, [current?.id, isGlobal])
        React.useEffect(() => {
          if (!open) return
          placePopover()
          const onDoc = e => {
            if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
            setOpen(false)
          }
          const onKey = e => { if (e.key === 'Escape') setOpen(false) }
          document.addEventListener('pointerdown', onDoc)
          document.addEventListener('keydown', onKey)
          window.addEventListener('resize', placePopover)
          return () => {
            document.removeEventListener('pointerdown', onDoc)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', placePopover)
          }
        }, [open])
        if (!isGlobal) return null
        const historyList = historySessionsFor(row.workspaceId, workspaces, sessions, allBotSessionIds())
        const startNewGlobalSession = () => {
          setOpen(false)
          forgetPage()
          nav.startSession(row.workspaceId)
          changed()
        }
        return h('div', { className: 'lw-corner-wrap' },
          h('button', {
            ref: triggerRef, type: 'button', className: 'lw-corner-btn',
            'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-label': '助手历史对话',
            onClick: () => { if (!open) placePopover(); setOpen(prev => !prev) },
          }, h(Icon, { name: 'chat' }), h('span', null, '历史对话'), historyList.length > 0 && h('span', { className: 'lw-seg-count' }, historyList.length)),
          !current.blank && h('button', {
            type: 'button', className: 'lw-corner-btn', 'aria-label': '新建全局对话',
            onClick: startNewGlobalSession,
          }, h(Icon, { name: 'plus' }), h('span', null, '新对话')),
          open && ReactDOM.createPortal(
            h('div', {
              ref: popoverRef, className: 'lw-session-popover', role: 'dialog',
              'aria-label': '助手历史对话列表',
              style: { top: pos.top, left: pos.left },
            },
            h('div', { className: 'lw-session-popover-head' },
              h('strong', null, `${row.name || 'Weave'} · 历史对话`),
              h('span', { className: 'lw-actions', style: { gap: 4 } },
                Btn({ variant: 'ghost', size: 'xs', disabled: Boolean(current.blank), onClick: startNewGlobalSession }, '+ 新对话'),
                tool('close', '关闭列表', () => setOpen(false)))),
            h('div', { className: 'lw-session-popover-list' },
              !historyList.length
                ? h('p', { className: 'lw-hint', style: { padding: '12px 6px', margin: 0, textAlign: 'center' } }, '暂无历史对话，发送消息后会自动保存。')
                : historyList.map(s => h('div', { className: 'lw-row', key: s.id },
                  h('button', {
                    type: 'button', className: 'lw-row-main',
                    'aria-current': current.id === s.id ? 'page' : undefined,
                    onClick: () => { setOpen(false); openChat(s.id) },
                  },
                  h('span', { className: 'lw-row-title' }, chatTitle(s)),
                  Boolean(s.updatedAt) && h('span', { className: 'lw-row-time' }, fmtDate(s.updatedAt))),
                  h('span', { className: 'lw-row-tools' },
                    tool('edit', '重命名对话 ' + chatTitle(s), () => { setOpen(false); setSessionDialog({ type: 'rename-session', row, session: s }) }),
                    tool('trash', '删除对话 ' + chatTitle(s), () => { setOpen(false); setSessionDialog({ type: 'delete-session', row, session: s }) }, 'lw-tool-danger')))))),
            document.body),
          sessionDialog && h(SessionActionDialog, { dialog: sessionDialog, onCancel: () => setSessionDialog(null) }))
      })

      slot('conversation.session.header.corner', { id: 'labweave-rightbar-picker', priority: -20 }, () => {
        useNav()
        const sessions = useStore(ctx.sessions.list)
        const current = Object.values(sessions.byId).find(s => s.retainedBy.mainView > 0)
        const sid = current?.id
        const row = currentRow()
        const isGlobal = !row || row.scope === 'global'
        useStore(ctx.layout.panelInfo)
        useSandboxNotifications(!isGlobal && isSandboxChat(sid) ? sid : null)
        const isOpen = () => Boolean(sid && document.querySelector(`[data-sidebar-right-session="${sid}"][data-sidebar-right-open]`))
        const [rightOpen, setRightOpen] = React.useState(isOpen)
        React.useEffect(() => {
          if (sid && isGlobal && isOpen()) {
            try {
              ctx.sidebarRight?.actionsFor?.(sid)?.setExpanded?.(sid, false)
              ctx.layout?.closeRightbar?.()
            } catch {}
            setRightOpen(false)
            return
          }
          setRightOpen(isOpen())
          const col = document.querySelector('[data-rightbar-col]')
          if (!col || !sid || isGlobal) return
          const obs = new MutationObserver(() => setRightOpen(isOpen()))
          obs.observe(col, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sidebar-right-open'] })
          return () => obs.disconnect()
        }, [sid, isGlobal])
        const toggleRightbar = () => {
          if (!sid || isGlobal || !ctx.sidebarRight) return
          try {
            const expandedNow = isOpen()
            const actions = ctx.sidebarRight.actionsFor?.(sid)
            if (expandedNow) {
              if (actions?.setExpanded) actions.setExpanded(sid, false)
              else if (ctx.sidebarRight.toggleExpanded) ctx.sidebarRight.toggleExpanded()
              ctx.layout.closeRightbar()
            } else {
              const hasOpenTab = Boolean(ctx.sidebarRight.openTabs?.getSnapshot?.().some(t => t.sessionId === sid))
              if (!hasOpenTab) ctx.sidebarRight.openTabIn(sid, 'guide')
              actions?.setExpanded?.(sid, true)
            }
          } catch (err) { notice(err.message) }
          changed()
        }
        if (!sid || isGlobal) return null
        return h('div', { className: 'lw-corner-wrap' },
          h('button', {
            type: 'button', className: 'lw-corner-btn',
            'aria-expanded': rightOpen, 'aria-label': '右侧栏',
            onClick: toggleRightbar,
          }, h(Icon, { name: 'sidebarRight' }), h('span', null, '右侧栏')))
      })

      const parseModelCapacity = text => {
        const trimmed = String(text || '').trim()
        if (!trimmed) return undefined
        const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(trimmed)
        if (!match) return NaN
        const suffix = match[2]?.toLowerCase()
        const scale = suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1
        const scaled = Number(match[1]) * scale
        const rounded = Math.round(scaled)
        return Number.isFinite(rounded) && rounded > 0 && Math.abs(scaled - rounded) < 1e-6 ? rounded : NaN
      }
      const formatModelCapacity = value => {
        if (!Number.isInteger(value) || value <= 0) return ''
        if (value % 1e6 === 0) return `${value / 1e6}M`
        if (value % 1e3 === 0) return `${value / 1e3}K`
        return String(value)
      }
      const lastModelByProvider = new Map()
      const CAPACITY_PRESETS = [32000, 64000, 128000, 256000, 512000, 1000000]
      const readPath = (root, path) => {
        if (!path?.length) return root
        if (settingsSchemaApi?.getPath) {
          try { return settingsSchemaApi.getPath(root, path) } catch {}
        }
        return path.reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), root)
      }
      const deriveProviderKeyRef = provider => `${String(provider || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`

      function ModelOptionsSlot({ locked, dismiss, reportFailure }) {
        useNav()
        const sessions = useStore(ctx.sessions.list)
        const activeFallback = Object.values(sessions.byId).find(s => s.retainedBy.mainView > 0)
        const rootRef = React.useRef(null)
        const [sid, setSid] = React.useState(() => activeFallback?.id || null)
        React.useLayoutEffect(() => {
          const domSid = rootRef.current?.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
          const resolved = domSid || activeFallback?.id || null
          if (resolved !== sid) setSid(resolved)
        })
        const dir = React.useMemo(() => {
          if (!sid || !modelDirectoriesApi?.directoryFor) return null
          try { return modelDirectoriesApi.directoryFor(sid) } catch { return null }
        }, [sid, modelDirectoriesApi])
        const emptyStore = React.useMemo(() => ({
          subscribe: () => () => {},
          getSnapshot: () => ({ current: null, groups: [], status: 'idle', pending: null }),
        }), [])
        const dirSnap = useStore(dir?.store || emptyStore)
        const groups = dirSnap.groups?.length ? dirSnap.groups : catalogModelGroups
        const current = dirSnap.current || null
        const [subPane, setSubPane] = React.useState('root')
        const [busy, setBusy] = React.useState(false)
        const [errorText, setErrorText] = React.useState('')
        const [customCtx, setCustomCtx] = React.useState('')
        const [meta, setMeta] = React.useState({
          writable: false, providers: [], namespaces: new Map(), defaultModel: null, loaded: false,
        })

        const loadMeta = React.useCallback(async () => {
          const describe = ctx.configForms?.describe?.()
          if (describe?.ensure) await describe.ensure().catch(() => {})
          const mirror = describe?.getSnapshot?.()
          const views = mirror?.view?.namespaces || []
          const namespaces = new Map(views.map(v => [v.ns, v]))
          let registered = [], declared = []
          if (remoteLlm?.listProviders && remoteLlm?.listConfigurableProviders) {
            try {
              const [r1, r2] = await Promise.all([remoteLlm.listProviders(), remoteLlm.listConfigurableProviders()])
              if (r1?.ok && Array.isArray(r1.value)) registered = r1.value
              if (r2?.ok && Array.isArray(r2.value)) declared = r2.value
            } catch {}
          }
          const activeSet = new Set(registered.map(p => p.id))
          const seen = new Set()
          const joined = []
          for (const entry of declared) {
            seen.add(entry.provider)
            const ns = namespaces.get(entry.settingsNs)
            const prof = ns ? readPath(ns.value, entry.settingsPath) : undefined
            const namedRef = typeof prof?.apiKeyEnv === 'string' && prof.apiKeyEnv ? prof.apiKeyEnv : undefined
            joined.push({
              provider: entry.provider,
              displayName: prof?.displayName || entry.displayName || entry.provider,
              settingsNs: entry.settingsNs,
              settingsPath: [...(entry.settingsPath || [])],
              declared: Boolean(entry.declared),
              active: activeSet.has(entry.provider),
              api: prof?.api,
              apiKeyEnv: namedRef || deriveProviderKeyRef(entry.provider),
              nativeEnv: entry.nativeAuth?.env || [],
            })
          }
          for (const p of registered) {
            if (seen.has(p.id)) continue
            joined.push({
              provider: p.id, displayName: p.name || p.id, settingsNs: '', settingsPath: [],
              declared: false, active: true, apiKeyEnv: undefined, nativeEnv: [],
            })
          }
          let credMap = {}
          if (remoteCredentials?.describe) {
            const refs = [...new Set(joined.flatMap(j => [j.apiKeyEnv, ...(j.nativeEnv || [])]).filter(Boolean))]
            for (let i = 0; i < refs.length; i += 64) {
              try {
                const res = await remoteCredentials.describe(refs.slice(i, i + 64))
                if (res?.ok && res.value) Object.assign(credMap, res.value)
              } catch {}
            }
          }
          const enriched = joined.map(j => {
            const keys = [j.apiKeyEnv, ...(j.nativeEnv || [])].filter(Boolean)
            const hasKey = j.provider === 'deepseek-account' ? j.active : (!j.apiKeyEnv || keys.some(k => credMap[k]?.configured === true))
            return { ...j, hasKey }
          }).sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1))
          const adm = namespaces.get('agent-default-model')?.value
          setMeta({
            writable: Boolean(mirror?.view?.writable),
            providers: enriched,
            namespaces,
            defaultModel: adm?.provider && adm?.model ? { provider: adm.provider, model: adm.model } : null,
            loaded: true,
          })
        }, [])

        React.useEffect(() => {
          void loadMeta()
          const onUpd = () => { void loadMeta() }
          window.addEventListener('labweave:model-updated', onUpd)
          return () => window.removeEventListener('labweave:model-updated', onUpd)
        }, [loadMeta])

        React.useEffect(() => {
          if (current?.provider && current?.model) lastModelByProvider.set(current.provider, current.model)
        }, [current?.provider, current?.model])

        const switchPane = next => {
          if (rootRef.current?.contains(document.activeElement)) rootRef.current.focus()
          setErrorText('')
          setSubPane(next)
        }

        const currentGroup = groups.find(g => g.id === current?.provider) || null
        const currentModelObj = currentGroup?.models?.find(m => m.id === current?.model) || null
        const currentProvMeta = meta.providers.find(p => p.provider === current?.provider) || null
        const provDisplayName = currentProvMeta?.displayName
          || (current?.provider === 'deepseek-account' ? 'DeepSeek 账号' : currentGroup?.name)
          || current?.provider || '未选择'

        const currentNs = currentProvMeta?.settingsNs ? meta.namespaces.get(currentProvMeta.settingsNs) : null
        const modelsPath = currentProvMeta ? [...(currentProvMeta.settingsPath || []), 'models'] : ['models']
        const configuredModels = currentNs ? readPath(currentNs.value, modelsPath) : undefined
        const userModels = currentNs ? readPath(currentNs.user, modelsPath) : undefined
        const configuredEntry = Array.isArray(configuredModels) ? configuredModels.find(m => m && m.id === current?.model) : null
        const userEntry = Array.isArray(userModels) ? userModels.find(m => m && m.id === current?.model) : null
        const providerDefaultCtx = currentNs && currentProvMeta
          ? readPath(currentNs.value, [...(currentProvMeta.settingsPath || []), 'defaultContextWindow'])
          : undefined
        const effectiveContextWindow = configuredEntry?.contextWindow ?? currentModelObj?.contextWindow ?? providerDefaultCtx
        const isContextOverridden = typeof userEntry?.contextWindow === 'number'
        const contextLabel = typeof effectiveContextWindow === 'number'
          ? (formatModelCapacity(effectiveContextWindow) + (isContextOverridden ? '' : ' 默认'))
          : '默认'

        const canMutateSettings = Boolean(remoteSettings?.mutate && meta.writable && currentProvMeta?.settingsNs && current?.model)
        const canConfigCustomReasoning = canMutateSettings
          && currentProvMeta.settingsNs === 'llm-pi-ai'
          && !currentModelObj?.reasoning

        const applyModelConfigPatch = async patch => {
          if (!canMutateSettings || busy || locked) return
          setBusy(true); setErrorText('')
          try {
            const describe = ctx.configForms.describe()
            await describe.ensure()
            const mirror = describe.getSnapshot()
            const nsView = mirror?.view?.namespaces?.find(n => n.ns === currentProvMeta.settingsNs)
            if (!nsView) throw Error('当前供应商不支持在线改写模型参数。')
            const spath = currentProvMeta.settingsPath || []
            const mpath = [...spath, 'models']
            let baseList = readPath(nsView.user, mpath)
            if (!Array.isArray(baseList)) {
              const fromVal = readPath(nsView.value, mpath)
              if (Array.isArray(fromVal) && fromVal.length) {
                baseList = fromVal
              } else if (remoteLlm?.discoverModels) {
                const ans = await remoteLlm.discoverModels(currentProvMeta.settingsNs, { provider: currentProvMeta.provider })
                if (ans?.ok && Array.isArray(ans.value)) {
                  baseList = ans.value.map(c => ({
                    id: c.id,
                    ...(c.name && c.name !== c.id ? { name: c.name } : {}),
                    ...(typeof c.contextWindow === 'number' ? { contextWindow: c.contextWindow } : {}),
                    ...(typeof c.maxTokens === 'number' ? { maxTokens: c.maxTokens } : {}),
                    ...(Array.isArray(c.inputModalities)
                      ? { [currentProvMeta.settingsNs === 'llm-deepseek' ? 'inputModalities' : 'input']: [...c.inputModalities] }
                      : {}),
                  }))
                }
              }
            }
            const nextList = Array.isArray(baseList) ? baseList.map(m => ({ ...m })) : []
            let idx = nextList.findIndex(m => m && m.id === current.model)
            if (idx === -1) {
              nextList.push({
                id: current.model,
                ...(currentModelObj?.name && currentModelObj.name !== current.model ? { name: currentModelObj.name } : {}),
              })
              idx = nextList.length - 1
            }
            const item = { ...nextList[idx] }
            if ('contextWindow' in patch) {
              if (patch.contextWindow == null) delete item.contextWindow
              else item.contextWindow = patch.contextWindow
            }
            if ('reasoningEfforts' in patch) {
              if (patch.reasoningEfforts == null) delete item.reasoningEfforts
              else item.reasoningEfforts = patch.reasoningEfforts
            }
            nextList[idx] = item

            let ops
            if (spath.length > 0 && readPath(nsView.user, spath) === undefined) {
              const existing = readPath(nsView.value, spath)
              const profile = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? { ...existing } : {}
              ops = [{ op: 'set', path: spath, value: { ...profile, models: nextList } }]
            } else {
              ops = [{ op: 'set', path: mpath, value: nextList }]
            }
            const res = await remoteSettings.mutate(nsView.ns, ops, nsView.revision)
            if (!res?.ok) throw Error(res?.error?.message || '保存模型参数失败。')
            await describe.ensure().catch(() => {})
            await dir?.load?.().catch(() => {})
            await syncModelCatalogAndSessions()
            await loadMeta()
            return true
          } catch (err) {
            const msg = err?.message || '保存失败。'
            setErrorText(msg)
            reportFailure?.(msg)
            return false
          } finally {
            setBusy(false)
          }
        }

        const selectProviderGroup = async (group, chosenModel) => {
          if (!dir || busy || locked) return
          const target = chosenModel || group.models?.find(m => m.id === lastModelByProvider.get(group.id)) || group.models?.[0]
          if (!target) return
          setBusy(true); setErrorText('')
          try {
            const defaultEffort = target.reasoning?.defaultEffort
            const res = await dir.select({
              provider: group.id,
              model: target.id,
              ...(defaultEffort !== undefined ? { reasoningEffort: defaultEffort } : {}),
            })
            if (res && res.ok === false) throw Error(res.error?.message || '切换供应商模型失败。')
            lastModelByProvider.set(group.id, target.id)
            window.dispatchEvent(new Event('labweave:model-updated'))
            switchPane('root')
          } catch (err) {
            const msg = err?.message || '切换供应商失败。'
            setErrorText(msg)
            reportFailure?.(msg)
          } finally {
            setBusy(false)
          }
        }

        const setAsDefaultModel = async () => {
          if (!remoteSettings?.mutate || !meta.writable || !current?.provider || !current?.model || busy || locked) return
          setBusy(true); setErrorText('')
          try {
            const describe = ctx.configForms.describe()
            await describe.ensure()
            const admView = describe.getSnapshot()?.view?.namespaces?.find(n => n.ns === 'agent-default-model')
            const ops = [
              { op: 'set', path: ['provider'], value: current.provider },
              { op: 'set', path: ['model'], value: current.model },
            ]
            const res = await remoteSettings.mutate('agent-default-model', ops, admView?.revision)
            if (!res?.ok) throw Error(res?.error?.message || '设置默认模型失败。')
            await syncModelCatalogAndSessions()
            await loadMeta()
          } catch (err) {
            const msg = err?.message || '设置默认模型失败。'
            setErrorText(msg)
            reportFailure?.(msg)
          } finally {
            setBusy(false)
          }
        }

        const openModelSettings = () => {
          dismiss?.()
          openSettingsRef?.('models')
        }

        const isDefaultPair = Boolean(
          meta.defaultModel && current?.provider === meta.defaultModel.provider && current?.model === meta.defaultModel.model
        )

        const unconfiguredProviders = meta.providers.filter(p => !groups.some(g => g.id === p.provider))

        return h('div', { ref: rootRef, className: 'lw-mo-root', tabIndex: -1 },
          subPane === 'root' && h(React.Fragment, null,
            canConfigCustomReasoning && h('button', {
              type: 'button', role: 'menuitem', className: 'lw-mo-cell', disabled: busy || locked,
              onClick: () => switchPane('reasoning'),
            },
              h('span', { className: 'lw-mo-cell-label' }, '推理强度'),
              h('span', { className: 'lw-mo-cell-val' }, configuredEntry?.reasoningEfforts ? '已配置' : '默认（关闭）'),
              h(Icon, { name: 'right' })),
            current?.model && h('button', {
              type: 'button', role: 'menuitem', className: 'lw-mo-cell', disabled: busy || locked,
              onClick: () => { setCustomCtx(''); switchPane('context') },
            },
              h('span', { className: 'lw-mo-cell-label' }, '上下文窗口'),
              h('span', { className: 'lw-mo-cell-val' }, contextLabel),
              h(Icon, { name: 'right' })),
            h('div', { className: 'lw-mo-sep', 'aria-hidden': 'true' }),
            h('button', {
              type: 'button', role: 'menuitem', className: 'lw-mo-cell', disabled: busy || locked,
              onClick: () => switchPane('provider'),
            },
              h('span', { className: 'lw-mo-cell-label' }, '模型供应商'),
              h('span', { className: 'lw-mo-cell-val' }, provDisplayName),
              h(Icon, { name: 'right' })),
            errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText)),

          subPane === 'provider' && h('div', { className: 'lw-mo-sub', role: 'group', 'aria-label': '模型供应商' },
            h('div', { className: 'lw-mo-subhead' },
              h('button', { type: 'button', className: 'lw-mo-back', onClick: () => switchPane('root') },
                h(Icon, { name: 'back' }), h('span', null, '模型供应商')),
              current?.provider && current?.model && remoteSettings?.mutate && meta.writable && h('button', {
                type: 'button', className: 'lw-mo-pill', disabled: busy || locked || isDefaultPair,
                onClick: () => { void setAsDefaultModel() },
              }, isDefaultPair ? '已设为默认' : '设为全局默认')),
            groups.length > 0 && h('div', { className: 'lw-mo-group-label' }, '已启用供应商'),
            groups.map(group => {
              const pMeta = meta.providers.find(p => p.provider === group.id)
              const label = group.id === 'deepseek-account' ? 'DeepSeek 账号' : (pMeta?.displayName || group.name || group.id)
              const isSelected = current?.provider === group.id
              return h('div', { key: group.id },
                h('button', {
                  type: 'button', role: 'menuitemradio', 'aria-checked': isSelected,
                  className: 'lw-mo-opt', disabled: busy || locked || !group.models?.length,
                  onClick: () => { void selectProviderGroup(group) },
                },
                  h('span', { className: 'lw-mo-opt-main' },
                    h('span', { className: 'lw-mo-opt-title' }, label),
                    h('span', { className: 'lw-mo-opt-sub' }, `${group.models?.length || 0} 个模型`)),
                  isSelected && h(Icon, { name: 'check' })),
                group.models?.length > 1 && h('div', { className: 'lw-mo-pills' },
                  group.models.map(m => h('button', {
                    key: m.id, type: 'button', className: 'lw-mo-pill',
                    'aria-pressed': isSelected && current?.model === m.id,
                    disabled: busy || locked,
                    onClick: () => { void selectProviderGroup(group, m) },
                  }, m.name || m.id))))
            }),
            unconfiguredProviders.length > 0 && h(React.Fragment, null,
              h('div', { className: 'lw-mo-group-label' }, '未配置供应商（点击前往填写密钥）'),
              unconfiguredProviders.slice(0, 8).map(p => h('button', {
                key: p.provider, type: 'button', className: 'lw-mo-opt',
                onClick: openModelSettings,
              },
                h('span', { className: 'lw-mo-opt-main' },
                  h('span', { className: 'lw-mo-opt-title' }, p.displayName),
                  h('span', { className: 'lw-mo-opt-sub' }, `${p.provider} · 需配置 API Key`)),
                h(Icon, { name: 'right' })))),
            h('div', { className: 'lw-mo-sep', 'aria-hidden': 'true' }),
            h('button', { type: 'button', className: 'lw-mo-opt', onClick: openModelSettings },
              h('span', { className: 'lw-mo-opt-title' }, '添加 / 管理供应商与密钥…'),
              h(Icon, { name: 'right' })),
            errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText)),

          subPane === 'context' && h('div', { className: 'lw-mo-sub', role: 'group', 'aria-label': '上下文窗口长度' },
            h('div', { className: 'lw-mo-subhead' },
              h('button', { type: 'button', className: 'lw-mo-back', onClick: () => switchPane('root') },
                h(Icon, { name: 'back' }), h('span', null, `上下文窗口 · ${currentModelObj?.name || current?.model || ''}`))),
            !canMutateSettings
              ? h('p', { className: 'lw-hint', style: { margin: '6px 8px', fontSize: 12 } }, '当前模型配置为只读或由账号托管，无法修改上下文窗口。')
              : h(React.Fragment, null,
                CAPACITY_PRESETS.map(size => h('button', {
                  key: size, type: 'button', role: 'menuitemradio',
                  'aria-checked': effectiveContextWindow === size,
                  className: 'lw-mo-opt', disabled: busy || locked,
                  onClick: async () => {
                    if (await applyModelConfigPatch({ contextWindow: size })) switchPane('root')
                  },
                },
                  h('span', null, formatModelCapacity(size)),
                  effectiveContextWindow === size && h(Icon, { name: 'check' }))),
                isContextOverridden && h('button', {
                  type: 'button', className: 'lw-mo-opt', disabled: busy || locked,
                  onClick: async () => {
                    if (await applyModelConfigPatch({ contextWindow: null })) switchPane('root')
                  },
                }, h('span', null, '恢复模型默认')),
                h('form', {
                  className: 'lw-mo-custom',
                  onSubmit: async e => {
                    e.preventDefault()
                    const parsed = parseModelCapacity(customCtx)
                    if (!Number.isInteger(parsed) || parsed <= 0) {
                      setErrorText('请输入正整数（可带 K 或 M，例如 200K 或 131072）')
                      return
                    }
                    if (await applyModelConfigPatch({ contextWindow: parsed })) { setCustomCtx(''); switchPane('root') }
                  },
                },
                  h('input', {
                    type: 'text', inputMode: 'numeric', 'aria-label': '自定义上下文窗口长度',
                    placeholder: '自定义，如 200K / 131072', value: customCtx, disabled: busy || locked,
                    onChange: e => { setCustomCtx(e.target.value); setErrorText('') },
                  }),
                  Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy || locked || !customCtx.trim() }, '应用')),
                errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText))),

          subPane === 'reasoning' && h('div', { className: 'lw-mo-sub', role: 'group', 'aria-label': '模型推理强度配置' },
            h('div', { className: 'lw-mo-subhead' },
              h('button', { type: 'button', className: 'lw-mo-back', onClick: () => switchPane('root') },
                h(Icon, { name: 'back' }), h('span', null, '启用推理强度'))),
            h('p', { className: 'lw-hint', style: { margin: '4px 8px', fontSize: 12 } },
              '为该自定义/第三方模型启用标准推理档位，启用后可直接在上方「推理等级」中切换。'),
            h('button', {
              type: 'button', className: 'lw-mo-opt', disabled: busy || locked,
              onClick: async () => {
                const isGemini = currentProvMeta?.api === 'google-generative-ai'
                const efforts = isGemini
                  ? { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' }
                  : { off: null, low: 'low', medium: 'medium', high: 'high' }
                if (await applyModelConfigPatch({ reasoningEfforts: efforts })) switchPane('root')
              },
            },
              h('span', null, '启用（Off / Low / Medium / High）'),
              h(Icon, { name: 'check' })),
            errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText))
        )
      }
      slot('conversation.input.model.options', { id: 'labweave-model-controls', order: 10 }, ModelOptionsSlot)

      slot('settings.launcher', { id: 'labweave-flat-footer', priority: -30 }, ({ wide, openSettings }) => {
        openSettingsRef = openSettings
        const items = [
          ['model', '模型与 API', () => openSettings('models')],
          ['gear', '设置', () => openSettings()],
        ]
        return h('div', { className: 'lw-footer-bar', 'data-collapsed': wide ? 'false' : 'true' },
          items.map(([icon, label, click]) => h('button', {
            key: label, type: 'button', className: 'lw-footer-btn',
            'aria-label': label, title: label, onClick: click,
          }, h(Icon, { name: icon }), wide && h('span', null, label))))
      })

      slot('shell.overlay', { id: 'labweave-plugins' }, function Overlay() {
        useNav()
        const panel = useStore(ctx.layout.panelInfo)
        const [options, setOptions] = React.useState(null)
        const [profileOpen, setProfileOpen] = React.useState(false)
        const [error, setError] = React.useState('')
        const [splitTarget, setSplitTarget] = React.useState(null)
        React.useEffect(() => {
          const open = () => refresh().then(setOptions).catch(err => setError(err.message))
          const openProfile = () => setProfileOpen(true)
          const report = e => setError(e.detail)
          window.addEventListener(manage, open)
          window.addEventListener(openProfileEvent, openProfile)
          window.addEventListener('labweave:notice', report)
          return () => {
            window.removeEventListener(manage, open)
            window.removeEventListener(openProfileEvent, openProfile)
            window.removeEventListener('labweave:notice', report)
          }
        }, [])
        const activeSplit = Boolean(chatSplit && splitPanes.length > 0 && panel.activePanelId === null)
        React.useLayoutEffect(() => {
          const centerCol = document.querySelector('[class*="centerCol"]')
          if (!activeSplit || !centerCol) {
            if (centerCol) {
              delete centerCol.dataset.lwSplit
              centerCol.querySelector('.lw-split-host')?.remove()
            }
            setSplitTarget(null)
            return
          }
          centerCol.dataset.lwSplit = 'true'
          let host = centerCol.querySelector('.lw-split-host')
          if (!host) {
            host = document.createElement('div')
            host.className = 'lw-split-host'
            centerCol.appendChild(host)
          }
          setSplitTarget(host)
          return () => {
            delete centerCol.dataset.lwSplit
            host?.remove()
          }
        }, [activeSplit, splitPanes.map(p => p.workspaceId + ':' + p.feature).join('|'), panel.activePanelId])
        const splitPortal = activeSplit && splitTarget ? ReactDOM.createPortal(
          h('div', { className: 'lw-split-grid', 'aria-label': '分屏科研工作区' },
            splitPanes.map((p, idx) => {
              const row = rows.find(r => r.workspaceId === p.workspaceId && r.scope !== 'global')
              if (!row) return null
              return h(ProjectPage, {
                key: p.workspaceId + ':' + p.feature,
                row, feature: p.feature, paneIndex: idx, paneCount: splitPanes.length + 1,
              })
            })),
          splitTarget) : null
        return h(React.Fragment, null,
          splitPortal,
          error && h(Dialog, { title: '科研工作区', close: () => setError('') }, h('p', { role: 'alert' }, error),
            Btn({ variant: 'secondary', onClick: () => setError('') }, '关闭')),
          options && h(PluginForm, { rows: options, close: () => setOptions(null) }),
          profileOpen && h(AssistantProfileModal, {
            close: () => setProfileOpen(false),
            refresh,
            initialRow: globalRow(),
            openSettings: section => openSettingsRef?.(section),
            openSchedules: () => ctx.layout.selectPanel('schedules'),
            startGlobalChat: () => {
              const g = globalRow()
              forgetPage()
              if (g) nav.startSession(g.workspaceId)
              else nav.startSession()
              changed()
            },
          }))
      })
    }
    return { inject: ['slots', 'uiWorkspace', 'workspaces', 'sessions', 'layout', 'locale', 'theme', 'configForms', 'sidebarRight', 'sidebarRightTabs'], apply: install }
  },
})
