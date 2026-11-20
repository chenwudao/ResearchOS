window.__ModuleLoader__.load({
  id: 'labweave-research-workspace',
  factory: require => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    // Weave labels are source text and are used before the locale service starts.
    const LW = text => text
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
    function EntryImage({ src, alt, className = '', illustrated = false, caption }) {
      const [broken, setBroken] = React.useState(false)
      React.useEffect(() => { setBroken(false) }, [src])
      if (!src || broken) return null
      const isSvg = /^data:image\/svg\+xml/i.test(src)
      const media = h('div', { className, 'data-svg': isSvg ? 'true' : 'false' },
        h('img', { src, alt: alt || LW('配图'), loading: 'lazy', onError: () => setBroken(true) }))
      return illustrated ? h('figure', { className: 'lw-fbot-detail-figure' }, media,
        caption && h('figcaption', { className: 'lw-fbot-detail-caption' }, caption)) : media
    }
    function EntrySource({ item }) {
      let url
      try {
        const parsed = new URL(item.url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed
      } catch {}
      const savedSource = typeof item.source === 'string' ? item.source.trim() : ''
      const source = (!savedSource || savedSource === 'Weave' || savedSource === 'DSH')
        ? url?.hostname || (savedSource === 'DSH' ? 'Weave' : savedSource)
        : savedSource
      if (!source && !url) return null
      return h('footer', { className: 'lw-push-source' },
        source && h('span', null, LW('来源：'), source),
        url && h('a', { className: 'lw-item-link', href: url.href, title: url.href, target: '_blank',
          rel: 'noopener noreferrer', onClick: event => event.stopPropagation() }, LW('查看原文'), ' ↗'))
    }
    const features = { chat: LW('聊天'), feed: LW('动态'), ideas: LW('点子'), goals: LW('目标'), library: LW('资源库') }
    const createWorkspaceProject = LW('新建工作区项目')
    const permissionLabels = {
      'read-only': LW('仅可查看'), 'workspace-write': LW('工作区内修改'), 'danger-full-access': LW('完全权限'),
    }
    const updated = 'labweave:project-updated'
    const manage = 'labweave:manage-plugins'
    const nameChanged = 'labweave:assistant-name-changed'
    const openProfileEvent = 'labweave:open-assistant-profile'
    const profileChanged = 'labweave:assistant-profile-changed'
    const pageKey = 'labweave-project-page'
    const welcomeKey = 'labweave-welcome'
    const selectionKey = 'labweave.project-page.v2'
    const navEvent = 'labweave:navigate'
    const rewindEvent = 'labweave:conversation-rewind'
    const rewindKind = 'labweave-rewind'
    const requestId = () => crypto.randomUUID().replaceAll('-', '')

    const MD_INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[([^\]\n]+)\]\((https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'*+,;=%()]+|mailto:[^\s)]+)\))|(https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'*+,;=%()]+)/g
    const mdSafeUrl = value => /^(https?:\/\/|mailto:)/i.test(String(value || '').trim()) ? String(value).trim() : ''
    const mdTrimUrl = value => String(value || '').replace(/[。，、；：！？.,;:!?]+$/g, '')
    function inlineMarkdown(value, prefix = 'md', depth = 0) {
      const source = String(value ?? '')
      if (!source) return []
      if (depth > 3) return [source]
      const pattern = new RegExp(MD_INLINE.source, 'g')
      const nodes = []
      let last = 0, match, index = 0
      const push = node => {
        if (React.isValidElement(node)) nodes.push(React.cloneElement(node, { key: prefix + '-' + index++ }))
        else if (node) nodes.push(node)
      }
      while ((match = pattern.exec(source))) {
        if (match.index > last) push(source.slice(last, match.index))
        const token = match[0]
        if (match[1]) push(h('code', { className: 'lw-md-code' }, token.slice(1, -1)))
        else if (match[2]) push(h('strong', null, inlineMarkdown(token.slice(2, -2), prefix + '-b', depth + 1)))
        else if (match[3]) push(h('strong', null, inlineMarkdown(token.slice(2, -2), prefix + '-u', depth + 1)))
        else if (match[4]) push(h('del', null, inlineMarkdown(token.slice(2, -2), prefix + '-s', depth + 1)))
        else if (match[5] || match[6]) push(h('em', null, inlineMarkdown(token.slice(1, -1), prefix + '-i', depth + 1)))
        else if (match[7]) {
          const href = mdSafeUrl(match[9])
          push(href ? h('a', { href, target: '_blank', rel: 'noreferrer' }, inlineMarkdown(match[8], prefix + '-a', depth + 1)) : token)
        } else if (match[10]) {
          const url = mdTrimUrl(match[10])
          const tail = match[10].slice(url.length)
          const href = mdSafeUrl(url)
          push(href ? h('a', { href, target: '_blank', rel: 'noreferrer' }, url) : url)
          if (tail) push(tail)
        } else push(token)
        last = match.index + token.length
      }
      if (last < source.length) push(source.slice(last))
      return nodes
    }
    function markdownBlocks(value) {
      const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      const blockStart = line => /^\s*(```|#{1,6}\s|>\s?|[-*+]\s+|\d+[.)]\s+|---+\s*$|\*\*\*+\s*$|___+\s*$)/.test(line)
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (!line.trim()) { i++; continue }
        const fence = /^\s*```([\w-]*)\s*$/.exec(line)
        if (fence) {
          const body = []
          i++
          while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
          if (i < lines.length) i++
          blocks.push(h('pre', { key: 'md-f' + blocks.length },
            h('code', { 'data-language': fence[1] || undefined }, body.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          const tag = 'h' + Math.min(6, heading[1].length)
          blocks.push(h(tag, { key: 'md-h' + blocks.length }, inlineMarkdown(heading[2], 'md-h' + blocks.length)))
          i++
          continue
        }
        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
          blocks.push(h('hr', { key: 'md-r' + blocks.length }))
          i++
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''))
          blocks.push(h('blockquote', { key: 'md-q' + blocks.length }, markdownBlocks(quote.join('\n'))))
          continue
        }
        const ordered = /^\s*\d+[.)]\s+/.test(line)
        if (ordered || /^\s*[-*+]\s+/.test(line)) {
          const itemPattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/
          const items = []
          while (i < lines.length && itemPattern.test(lines[i])) {
            const item = itemPattern.exec(lines[i])[1]
            const check = /^\[([ xX])\]\s*(.*)$/.exec(item)
            const key = 'md-l' + blocks.length + '-' + items.length
            items.push(h('li', { key }, check
              ? [h('input', { key: key + '-c', type: 'checkbox', checked: check[1].toLowerCase() === 'x', disabled: true,
                  'aria-label': check[1].toLowerCase() === 'x' ? LW('已完成') : LW('未完成') }), ' ', ...inlineMarkdown(check[2], key)]
              : inlineMarkdown(item, key)))
            i++
          }
          blocks.push(h(ordered ? 'ol' : 'ul', { key: 'md-l' + blocks.length }, items))
          continue
        }
        const paragraph = [line]
        i++
        while (i < lines.length && lines[i].trim() && !blockStart(lines[i])) paragraph.push(lines[i++])
        const children = []
        paragraph.forEach((text, index) => {
          if (index) children.push(h('br', { key: 'md-p' + blocks.length + '-br' + index }))
          children.push(...inlineMarkdown(text, 'md-p' + blocks.length + '-' + index))
        })
        blocks.push(h('p', { key: 'md-p' + blocks.length }, children))
      }
      return blocks
    }
    function Markdown({ source, className = '' }) {
      return h('div', { className: ('lw-md ' + className).trim() }, markdownBlocks(source))
    }

    const recordSectionKinds = {
      '方法': 'method', '实验方法': 'method', '方法与设置': 'method', method: 'method', methods: 'method',
      '结论': 'finding', '主要结论': 'finding', '发现': 'finding', '结果': 'finding', '主要发现': 'finding',
      conclusion: 'finding', findings: 'finding', results: 'finding',
      '意义': 'implication', '启示': 'implication', implications: 'implication',
      '局限': 'limitation', '局限性': 'limitation', limitations: 'limitation',
      '证据等级': 'evidence', '证据': 'evidence', evidence: 'evidence',
      '假设': 'hypothesis', '缺口': 'gap', '验证': 'validation', '下一步': 'next',
    }

    function recordSections(source) {
      const sections = [{ lines: [] }]
      let fence = ''
      for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
        const boundary = /^ {0,3}(```+|~~~+)/.exec(line)
        if (boundary) {
          if (!fence) fence = boundary[1]
          else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length && line.trim() === boundary[1]) fence = ''
          sections.at(-1).lines.push(line)
          continue
        }
        const label = !fence && /^ {0,3}(?:\*\*([^*：:]{1,20}?)\s*(?:[：:]\*\*|\*\*\s*[：:])|([^*：:]{1,20}?)\s*[：:])\s*(.*)$/.exec(line)
        const name = label && (label[1] || label[2]).trim()
        const key = name && name.toLowerCase()
        const kind = key && Object.hasOwn(recordSectionKinds, key) && recordSectionKinds[key]
        if (kind) sections.push({ name, kind, lines: [label[3]] })
        else sections.at(-1).lines.push(line)
      }
      return sections
    }

    function RecordBody({ source }) {
      const text = String(source || '').trim()
      if (!text) return null
      const sections = recordSections(text)
      if (sections.length < 3) return h(Markdown, { source: text, className: 'lw-record-markdown' })
      return h('div', { className: 'lw-record-sections' }, sections.map(({ name, kind, lines }, index) => {
        const body = lines.join('\n').trim()
        if (!name) return body && h(Markdown, { key: index, source: body, className: 'lw-record-markdown' })
        return h('section', { key: index, className: 'lw-record-section', 'data-kind': kind },
          h('h3', null, name), body && h(Markdown, { source: body, className: 'lw-record-markdown' }))
      }))
    }

    function rewindStart(event) {
      const source = event?.type === 'user/message' && event.data?.source
      return source?.kind === rewindKind ? source.fromSeq : undefined
    }

    function rewindCuts(events) {
      return events.flatMap(event => {
        const from = rewindStart(event)
        return Number.isSafeInteger(from) ? [{ from, to: event.seq }] : []
      })
    }

    function isRewound(cuts, seq) {
      return cuts.some(cut => seq >= cut.from && seq < cut.to)
    }

    // DSH's Chat view retains append-only history even when its model surface changes.
    // Apply the durable rewind boundary to the native view before it groups and navigates rows.
    function rewindChatView(view) {
      const nodes = new Map()
      let cuts = []
      const mask = (node, timeline) => {
        const turnEnd = node.kind === 'turn-process' && timeline.turns.get(node.data.turn)?.end?.seq
        return isRewound(cuts, node.anchorSeq) || (typeof turnEnd === 'number' && isRewound(cuts, turnEnd))
          ? { ...node, visibility: 'hidden' } : node
      }
      const replace = timeline => view.replace({ nodes: [...nodes.values()].map(node => mask(node, timeline)), timeline })
      return {
        get empty() { return view.empty },
        replace({ nodes: next, timeline }) {
          nodes.clear()
          cuts = []
          for (const node of next) {
            nodes.set(node.key, node)
            if (node.kind === rewindKind) cuts.push(node.data)
          }
          return replace(timeline)
        },
        apply(input) {
          let hasRewind = false
          for (const node of input.upserts) {
            if (node.kind === rewindKind && !nodes.has(node.key)) {
              cuts.push(node.data)
              hasRewind = true
            }
            nodes.set(node.key, node)
          }
          return hasRewind ? replace(input.timeline)
            : view.apply({ ...input, upserts: input.upserts.map(node => mask(node, input.timeline)) })
        },
        groupInput: () => view.groupInput(),
        publish: () => view.publish(),
      }
    }

    // Keys from the built-in 0.2.2rc2 dictionaries. Only their static templates
    // belong to Weave. User names, tool output and interpolation arguments do not.
    const nativeBrandKeys = Object.fromEntries(Object.entries({
      common: 'brand.localBuild',
      chat: 'message.failure.interrupted',
      conversation: 'error.sessionInUse',
      model: 'error.sessionInUse',
      'settings.agentPreset': 'sectionIntro presetCordisDescription createPluginDescription guideStandardExplanation guideCordisExplanation guideCordisUsage',
      creationRecommendations: 'sourceRetained restart-required',
      entryCustomization: 'createPrompt.sidebar createPrompt.conversation createPrompt.rightbar',
      pluginManager: 'restartNotice restartReasonPackageMoved restartReasonHostModule restartReasonModuleComparison installSpecPlaceholder installGuideIdExample installGuideIdHint installGuideSafety installUpgradeNotice installProblemShipped installBundledTitle sourceTargetSpec sourceTargetVersion versionsBlocked versionsBlockedDetail updateLostDetail installDoneRestart reasonStopProfile reasonIncompatibleVersion reasonIncompatibleVersionUnnamed reasonUnsupportedPlatform reasonIncompatibleInstall reasonIncompatibleInstalled',
      pluginMarket: 'statusProvided incompatible noCompatibleVersion exempted',
      pluginRecommendations: 'version-error restart-required',
      'settings.account': 'onboardingBrand onboardingIntroduction onboardingCreditDescription onboardingProcessDescription onboardingNoCreditDescription backToHarness settingsSignedOutTitle settingsSignedOutDescription quotaDescription',
      'settings.models': 'onboardingTitle onboardingProvider onboardingChooseProvider keyHelp',
      shortcuts: 'web-document',
      sidebarBrowser: 'error.application-origin',
      sidebarOffice: 'unavailable',
      cuaPermissions: 'approvalRiskNotice windowsSetupBody windowsSessionUnknown',
      'voice-input': 'setup.local downloadAdvice.network downloadAdvice.dns downloadAdvice.timeout downloadAdvice.certificate downloadAdvice.storage downloadAdvice.unknown local',
      liveshare: 'dialog.hostUnavailable viewer.picker.version',
    }).map(([ns, keys]) => [ns, new Set(keys.split(' '))]))
    const runtimeVersionKeys = new Set([
      'sourceTargetSpec', 'sourceTargetVersion', 'versionsBlocked', 'versionsBlockedDetail', 'installUpgradeNotice',
      'reasonIncompatibleVersion', 'reasonIncompatibleVersionUnnamed', 'reasonIncompatibleInstall',
      'reasonIncompatibleInstalled', 'incompatible', 'noCompatibleVersion', 'exempted', 'version-error', 'viewer.picker.version',
    ])
    const interfaceCopy = {
      keyHelp: {
        zh: '优先使用已保存的凭据。备用环境变量按此顺序读取：{env}。依次检查启动环境、工作目录和运行环境配置目录中的 .env 文件。',
        en: 'Saved credentials take priority. Fallback variables, in order: {env}. Sources are the launch environment, then .env in the working directory and in the runtime configuration directory.',
        ja: '保存済みの認証情報を優先します。代替の環境変数は {env} の順です。起動環境、作業ディレクトリの .env、ランタイム設定ディレクトリの .env の順に確認します。',
        es: 'Se usan primero las credenciales guardadas. Variables alternativas, en orden: {env}. Se consulta el entorno de inicio, luego el archivo .env del directorio de trabajo y el del directorio de configuración del entorno de ejecución.',
        fr: 'Les identifiants enregistrés sont prioritaires. Variables de secours, dans l’ordre : {env}. Les sources sont l’environnement de lancement, puis les fichiers .env du dossier de travail et du dossier de configuration du moteur.',
        de: 'Gespeicherte Zugangsdaten haben Vorrang. Ersatzvariablen in Reihenfolge: {env}. Geprüft werden die Startumgebung, dann die .env-Dateien im Arbeitsverzeichnis und im Konfigurationsverzeichnis der Laufzeitumgebung.',
        ru: 'Сначала используются сохранённые учётные данные. Резервные переменные по порядку: {env}. Источники — окружение запуска, затем файлы .env в рабочем каталоге и в каталоге настроек среды выполнения.',
        pt: 'As credenciais salvas têm prioridade. Variáveis alternativas, em ordem: {env}. São consultados o ambiente de inicialização e, depois, os arquivos .env do diretório de trabalho e do diretório de configuração do ambiente de execução.',
      },
      onboardingTitle: {
        zh: '配置模型 API', en: 'Configure model API', ja: 'モデル API を設定',
        de: 'Modell-API einrichten', es: 'Configurar API del modelo', fr: 'Configurer l’API du modèle',
        pt: 'Configurar API do modelo', ru: 'Настройка API модели',
      },
      onboardingProvider: {
        zh: '模型供应商', en: 'Model provider', ja: 'モデルプロバイダー', de: 'Modellanbieter',
        es: 'Proveedor del modelo', fr: 'Fournisseur du modèle', pt: 'Fornecedor do modelo', ru: 'Поставщик модели',
      },
      onboardingChooseProvider: {
        zh: '选择模型供应商', en: 'Choose a model provider', ja: 'モデルプロバイダーを選択', de: 'Modellanbieter auswählen',
        es: 'Selecciona un proveedor', fr: 'Choisir un fournisseur', pt: 'Escolha um fornecedor', ru: 'Выберите поставщика',
      },
      'error.sessionInUse': {
        zh: '这段会话已在其他窗口或实例中打开。请先关闭占用它的实例，再重试。',
        en: 'This session is in use. Close the other instance using it, then try again.',
        ja: 'このセッションは使用中です。使用している別のインスタンスを閉じて、もう一度お試しください。',
        de: 'Diese Sitzung wird bereits verwendet. Schließe die andere Instanz und versuche es erneut.',
        es: 'Esta sesión está en uso. Cierra la otra instancia que la está usando y vuelve a intentarlo.',
        fr: 'Cette session est en cours d’utilisation. Fermez l’autre instance qui l’utilise, puis réessayez.',
        pt: 'Esta sessão está em uso. Feche a outra instância que a está usando e tente novamente.',
        ru: 'Этот сеанс уже используется. Закройте другой экземпляр приложения, в котором он открыт, и повторите попытку.',
      },
      sourceRetained: {
        zh: '撤销后，插件源码仍保存在原工作区。', en: 'Undo keeps the plugin source files in the original workspace.',
        ja: '取り消しても、プラグインのソースは元のワークスペースに残ります。', de: 'Beim Rückgängigmachen bleiben die Quelldateien im ursprünglichen Arbeitsbereich.',
        es: 'Al deshacer, los archivos fuente se conservan en el espacio de trabajo original.', fr: 'L’annulation conserve les sources dans l’espace de travail d’origine.',
        pt: 'Ao desfazer, os arquivos-fonte permanecem no espaço de trabalho original.', ru: 'После отмены исходные файлы останутся в исходной рабочей области.',
      },
      installGuideIdHint: {
        zh: '输入插件文档中列出的 npm 包名，例如 @author/plugin。', en: 'Use the npm package name from the plugin documentation, such as @author/plugin.',
        ja: 'プラグインの説明に記載されている npm パッケージ名（例：@author/plugin）を入力します。', de: 'Verwende den npm-Paketnamen aus der Plugin-Dokumentation, etwa @author/plugin.',
        es: 'Usa el nombre del paquete npm que figura en la documentación del complemento, por ejemplo @author/plugin.', fr: 'Utilisez le nom du paquet npm indiqué dans la documentation de l’extension, par exemple @author/plugin.',
        pt: 'Use o nome do pacote npm indicado na documentação do plugin, como @author/plugin.', ru: 'Введите имя npm-пакета из документации плагина, например @author/plugin.',
      },
      reasonStopProfile: {
        zh: '此配置不支持热更新。请先停止当前实例，再通过运行环境的命令行工具卸载插件。',
        en: 'This profile does not support hot reload. Stop this instance, then uninstall the plugin with the runtime CLI.',
        ja: 'この構成ではホットリロードできません。このインスタンスを停止し、ランタイムの CLI でプラグインを削除してください。',
        de: 'Dieses Profil unterstützt kein Neuladen im Betrieb. Beende die Instanz und deinstalliere das Plugin über die Befehlszeile der Laufzeitumgebung.',
        es: 'Este perfil no admite la recarga en caliente. Detén la instancia y desinstala el complemento desde la línea de comandos del entorno de ejecución.',
        fr: 'Ce profil ne permet pas le rechargement à chaud. Arrêtez cette instance, puis désinstallez l’extension via la ligne de commande du moteur.',
        pt: 'Este perfil não permite recarga em tempo de execução. Pare a instância e desinstale o plugin pela linha de comando do ambiente de execução.',
        ru: 'Этот профиль не поддерживает горячую перезагрузку. Остановите экземпляр и удалите плагин через командную строку среды выполнения.',
      },
      'web-document': {
        zh: '此网站在当前浏览器中保存的快捷键设置', en: 'the shortcut settings saved for this site in this browser',
        ja: 'このブラウザーに保存された、このサイトのショートカット設定', de: 'die in diesem Browser gespeicherten Tastenkürzel dieser Website',
        es: 'los atajos de este sitio guardados en el navegador', fr: 'les raccourcis de ce site enregistrés dans ce navigateur',
        pt: 'os atalhos deste site salvos neste navegador', ru: 'настройки сочетаний клавиш сайта, сохранённые в этом браузере',
      },
      onboardingCreditDescription: {
        zh: '使用 DeepSeek 账号执行任务时，模型和工具使用的 token 会消耗该账号的额度。请确保余额充足，以免任务中断。',
        en: 'When you use a DeepSeek account, tokens used by models and tools consume its credits. Keep enough credit available to avoid interrupting a task.',
        ja: 'DeepSeek アカウントでは、モデルやツールが使用したトークンに応じてクレジットが消費されます。タスクが中断しないよう残高を確認してください。',
        de: 'Bei einem DeepSeek-Konto verbrauchen die von Modellen und Werkzeugen genutzten Tokens Guthaben. Achte auf ausreichendes Guthaben, damit Aufgaben nicht unterbrochen werden.',
        es: 'Al usar una cuenta de DeepSeek, los tokens que consumen los modelos y las herramientas se descuentan de su saldo. Mantén saldo suficiente para evitar interrupciones.',
        fr: 'Avec un compte DeepSeek, les jetons utilisés par les modèles et les outils sont déduits de son solde. Prévoyez suffisamment de crédit pour éviter une interruption.',
        pt: 'Ao usar uma conta DeepSeek, os tokens usados por modelos e ferramentas consomem o saldo da conta. Mantenha saldo suficiente para evitar interrupções.',
        ru: 'При использовании аккаунта DeepSeek токены моделей и инструментов расходуют средства с его баланса. Пополните баланс заранее, чтобы задача не прервалась.',
      },
      onboardingNoCreditDescription: {
        zh: '此 DeepSeek 账号余额不足，暂时无法用它开始新任务。稍后可在「设置 → 账号与余额」中充值。',
        en: 'This DeepSeek account needs credit to start new tasks. You can top up later in Settings → Account.',
        ja: 'この DeepSeek アカウントで新しいタスクを開始するにはクレジットが必要です。後で「設定 → アカウント」から追加できます。',
        de: 'Dieses DeepSeek-Konto benötigt Guthaben für neue Aufgaben. Du kannst es später unter Einstellungen → Konto aufladen.',
        es: 'Esta cuenta de DeepSeek necesita saldo para iniciar tareas. Puedes recargarla más tarde en Ajustes → Cuenta.',
        fr: 'Ce compte DeepSeek a besoin de crédit pour démarrer de nouvelles tâches. Vous pouvez le recharger dans Paramètres → Compte.',
        pt: 'Esta conta DeepSeek precisa de saldo para iniciar tarefas. Você pode recarregá-la em Configurações → Conta.',
        ru: 'Для запуска новых задач через этот аккаунт DeepSeek нужно пополнить баланс. Это можно сделать позже в настройках аккаунта.',
      },
      quotaDescription: {
        zh: '此 DeepSeek 账号余额不足。要前往充值吗？也可以稍后在「设置 → 账号与余额」中充值。',
        en: 'This DeepSeek account has insufficient credit. Top up now? You can also top up later in Settings → Account.',
        ja: 'この DeepSeek アカウントの残高が不足しています。今すぐ追加しますか？ 後で「設定 → アカウント」から追加することもできます。',
        de: 'Das Guthaben dieses DeepSeek-Kontos reicht nicht aus. Jetzt aufladen? Das ist auch später unter Einstellungen → Konto möglich.',
        es: 'La cuenta de DeepSeek no tiene saldo suficiente. ¿Quieres recargar ahora? También puedes hacerlo más tarde en Ajustes → Cuenta.',
        fr: 'Le solde de ce compte DeepSeek est insuffisant. Voulez-vous le recharger maintenant ? Vous pouvez aussi le faire plus tard dans Paramètres → Compte.',
        pt: 'O saldo desta conta DeepSeek é insuficiente. Deseja recarregar agora? Você também pode fazer isso depois em Configurações → Conta.',
        ru: 'На балансе этого аккаунта DeepSeek недостаточно средств. Пополнить сейчас? Это можно сделать позже в настройках аккаунта.',
      },
    }
    const runtimeLabel = { zh: 'Weave 运行环境', en: 'Weave runtime', ja: 'Weave ランタイム', de: 'Weave-Runtime',
      es: 'Weave Runtime', fr: 'Weave Runtime', pt: 'Weave Runtime', ru: 'Weave Runtime' }
    function brandedTranslation(original, ns, key, params, locale) {
      if (!Object.hasOwn(nativeBrandKeys, ns) || !nativeBrandKeys[ns].has(key)) return undefined
      const language = locale.toLowerCase().split('-')[0]
      const copy = interfaceCopy[key]
      let template
      if (copy) template = copy[language] || copy.en
      else if (key === 'brand.localBuild') template = 'Weave'
      else if (key === 'installSpecPlaceholder' || key === 'installGuideIdExample') template = '@author/plugin'
      else {
        const technical = runtimeVersionKeys.has(key)
        const account = ns === 'settings.account' && key.startsWith('settingsSignedOut')
        const name = technical ? (runtimeLabel[language] || runtimeLabel.en) : account ? 'DeepSeek' : 'Weave'
        template = original(ns, key)
        if (ns === 'settings.agentPreset' && (key === 'guideStandardExplanation' || key === 'guideCordisExplanation')) {
          template = template.replace('dsh-doc skill', language === 'zh' ? '内置开发指南' : 'bundled developer guide')
            .replace('dsh-doc 指引', '内置开发指引').replace('dsh-doc guidance', 'built-in guidance')
        }
        template = template.replace(/DeepSeek Harness|LabWeave|\bDSH\b/g, name)
      }
      // Match the pinned runtime's interpolation semantics after branding the template.
      return params ? template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match) : template
    }

    // The native generic tool card formats its summary outside the locale service.
    // Only change the generated name at the start of the disclosure header. A failed
    // call shows the first line of its output there, which must stay verbatim.
    function observeToolSummaries(labelFor) {
      const selector = '[data-chat-call-id] [data-tool^="labweave_"]:not([data-state="error"])'
      function update(row) {
        const name = row.dataset.tool
        const display = labelFor(name)
        const replaceName = text => {
          if (!text || (text !== name && !text.startsWith(name + ' · ') && !text.startsWith(name + '：'))) return text
          return display + text.slice(name.length).replace(/^\s*[·：]\s*/, '：')
        }
        for (const span of row.querySelectorAll(':scope > div > [data-disclosure-header] [data-disclosure-row] [class*="summary"] > span')) {
          const text = span.firstChild
          if (text?.nodeType === Node.TEXT_NODE && text.data !== replaceName(text.data)) {
            text.data = replaceName(text.data)
          }
          const shimmer = span.getAttribute('data-shimmer-text')
          if (shimmer && shimmer !== replaceName(shimmer)) span.setAttribute('data-shimmer-text', replaceName(shimmer))
        }
      }
      const observer = new MutationObserver(records => {
        const rows = new Set()
        for (const record of records) {
          const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement
          const current = target?.closest(selector)
          if (current) rows.add(current)
          for (const node of record.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue
            if (node.matches(selector)) rows.add(node)
            for (const row of node.querySelectorAll(selector)) rows.add(row)
          }
        }
        for (const row of rows) update(row)
      })
      observer.observe(document.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['data-tool', 'data-state', 'data-shimmer-text'] })
      document.querySelectorAll(selector).forEach(update)
      return () => observer.disconnect()
    }

    const styles = `
      [data-chat-running]:not([data-holding]) [class*="runningIcon"]{background:transparent url('./weave-orbit.svg') center / contain no-repeat}
      [data-chat-running]:not([data-holding]) [class*="runningIcon"] > *{display:none}
      .lw-assigned-kind{font-size:var(--lw-ui-sm,13px);color:var(--dsw-alias-label-secondary);font-weight:500}
      .lw-assigned-row{display:grid;gap:4px;padding:8px 0;overflow-wrap:anywhere}
      .lw-assigned-row+.lw-assigned-row{border-top:.5px solid var(--dsw-alias-border-l2)}
      .lw-assigned-row strong{font-weight:550}.lw-assigned-row span,.lw-assigned-row small{color:var(--dsw-alias-label-secondary)}
      .lw-assigned-doc{display:grid;gap:5px;padding:9px 0;overflow-wrap:anywhere}
      .lw-assigned-doc+.lw-assigned-doc{border-top:.5px solid var(--dsw-alias-border-l2)}
      .lw-assigned-doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .lw-assigned-doc-title{font-weight:550;font-size:var(--lw-ui-sm,13px);line-height:1.4;color:var(--dsw-alias-label-primary);min-width:0;overflow-wrap:anywhere}
      .lw-assigned-doc-actions{display:flex;gap:2px;flex:none}
      .lw-assigned-doc-actions button{display:inline-grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-tertiary,#94a3b8);cursor:pointer;transition:background-color .14s ease,color .14s ease}
      .lw-assigned-doc-actions button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary)}
      .lw-assigned-doc-actions button.lw-tool-danger:hover{color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1))}
      .lw-assigned-doc-actions button:disabled{opacity:.45;cursor:default}
      .lw-assigned-doc-actions button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-assigned-doc-actions .lw-icon{width:14px;height:14px}
      .lw-assigned-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:var(--lw-ui-xs,12px);line-height:1.4;color:var(--dsw-alias-label-secondary)}
      .lw-assigned-hint{margin:0;font-size:var(--lw-ui-xs,12px);line-height:1.55;color:var(--dsw-alias-label-tertiary,#94a3b8)}
      .lw-md{display:block;font-size:var(--lw-ui-sm,13px);line-height:1.62;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
      .lw-md>:first-child{margin-top:0}.lw-md>:last-child{margin-bottom:0}
      .lw-md p{margin:0 0 7px}
      .lw-md h1,.lw-md h2,.lw-md h3,.lw-md h4,.lw-md h5,.lw-md h6{margin:9px 0 5px;line-height:1.35;font-weight:600;letter-spacing:-.01em}
      .lw-md h1{font-size:1.35em}.lw-md h2{font-size:1.22em}.lw-md h3{font-size:1.12em}.lw-md h4,.lw-md h5,.lw-md h6{font-size:1em}
      .lw-md ul,.lw-md ol{margin:0 0 7px;padding-left:1.35em;display:grid;gap:2px}
      .lw-md li{line-height:1.55}
      .lw-md li input{margin:0 4px 0 0;vertical-align:-1px}
      .lw-md strong{font-weight:650}
      .lw-md code,.lw-md-pre{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08)));font-family:var(--ds-font-family-code,monospace);font-size:.92em}
      .lw-md pre{margin:0 0 7px;padding:9px 11px;overflow:auto;white-space:pre-wrap;line-height:1.55}
      .lw-md pre code{padding:0;background:transparent;font-size:inherit}
      .lw-md blockquote{margin:0 0 7px;padding:2px 0 2px 10px;border-left:2px solid var(--dsw-alias-border-l3,rgba(128,128,128,.3));color:var(--dsw-alias-label-secondary)}
      .lw-md .lw-md-quote>:last-child{margin-bottom:0}
      .lw-md a{color:var(--dsw-alias-state-business-primary,#3b82f6);text-decoration:underline;text-underline-offset:2px}
      .lw-md hr{margin:10px 0;border:0;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}
      .lw-assigned-editor{display:grid;gap:10px;margin-top:10px}
      .lw-assigned-preview{border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));border-radius:var(--dsw-radius-md,8px);padding:9px 11px;background:var(--dsw-alias-bg-base,Canvas);max-height:220px;overflow:auto}
      .lw-task-count{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:var(--dsw-alias-state-business-primary,#3b82f6);color:#fff;font:600 9px/14px var(--ds-font-family-code,monospace);text-align:center}
      .lw-symbol-mark{font-family:"Segoe UI Symbol",sans-serif;text-align:center}
      .lw-bot-form-dialog .lw-dialog-head{margin-bottom:10px}
      .lw-bot-form-dialog .lw-form{gap:10px}
      .lw-bot-form-dialog .lw-form label{gap:4px}
      .lw-bot-form-dialog .lw-form textarea{min-height:60px}
      .lw-bot-create{width:min(39rem,calc(100vw - 1.5rem));padding:16px}
      .lw-paradigm-set{border:0;margin:0;padding:0;min-width:0}
      .lw-paradigm-set legend{margin-bottom:6px;font-weight:600}
      .lw-paradigm-options{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
      .lw-paradigm-option{position:relative;text-align:center;padding:4px;border:1px solid var(--dsw-alias-border-l3,#8885);border-radius:8px;cursor:pointer}
      .lw-paradigm-option input{position:absolute;opacity:0;width:1px;height:1px}
      .lw-paradigm-option:has(:checked),.lw-paradigm-option:has(:focus-visible){outline:2px solid var(--dsw-focus-ring-color,#3b82f6);outline-offset:-1px}
      .lw-paradigm-art{display:grid;place-items:center;min-height:76px;border-radius:5px;background:color-mix(in srgb,var(--lw-paradigm-accent) 14%,transparent);color:var(--lw-paradigm-accent)}
      .lw-paradigm-art svg{width:37px;height:37px}
      .lw-paradigm-art .lw-symbol-mark{font-size:30px;line-height:1}
      .lw-paradigm-options-ext{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:7px}
      .lw-paradigm-options-ext .lw-paradigm-art{min-height:56px}
      .lw-paradigm-options-ext .lw-paradigm-art svg{width:26px;height:26px}
      .lw-paradigm-options-ext .lw-paradigm-art .lw-symbol-mark{font-size:22px}
      .lw-paradigm-preview-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#8881)}
      .lw-paradigm-preview-badge{width:34px;height:34px;border-radius:7px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--lw-paradigm-accent,#638fd5) 14%,transparent);color:var(--lw-paradigm-accent,#638fd5)}
      .lw-paradigm-preview-badge svg{width:20px;height:20px}
      .lw-paradigm-avatar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(32px,1fr));gap:4px;max-height:132px;overflow:auto;padding:6px;border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:8px;background:var(--dsw-alias-bg-base,Canvas)}
      .lw-paradigm-avatar-grid button{display:grid;place-items:center;height:30px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
      .lw-paradigm-avatar-grid button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882);color:var(--dsw-alias-label-primary)}
      .lw-paradigm-avatar-grid button[aria-pressed="true"]{border-color:var(--dsw-focus-ring-color,#3b82f6);background:color-mix(in srgb,var(--dsw-focus-ring-color,#3b82f6) 12%,transparent);color:var(--dsw-alias-label-primary)}
      .lw-row-main[data-paradigm] .lw-icon,.lw-row-main[data-paradigm] .lw-symbol-mark{color:var(--lw-paradigm-accent,currentColor)}
      .lw-extension-fields{display:grid;gap:8px;min-width:0}
      .lw-extension-field{display:grid;grid-template-columns:minmax(90px,1.4fr) minmax(68px,1fr) minmax(80px,1fr) auto;align-items:end;gap:6px}
      .lw-extension-field :is(input,select){min-width:0;width:100%}
      @media(max-width:490px){.lw-extension-field{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto}.lw-extension-field>label:first-child{grid-column:1/-1}}
      .lw-paradigm-view{display:grid;gap:18px;min-width:0;margin-block:4px 12px}
      .lw-paradigm-view :is(h3,h4,p,ul,ol,dl),.lw-paradigm-fields dd{margin:0}
      .lw-paradigm-list{list-style:none;padding:0}
      .lw-paradigm-surface{border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:12px;min-width:0;overflow:hidden}
      .lw-paradigm-group summary{cursor:pointer;display:flex;align-items:center;gap:9px;padding:10px 14px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1,#8881);font-weight:600}
      .lw-paradigm-group summary::after{content:'›';margin-inline-start:auto;rotate:90deg}
      .lw-paradigm-group:not([open]) summary::after{rotate:0deg}
      .lw-paradigm-group summary .lw-icon,.lw-paradigm-row-icon{color:var(--dsw-alias-label-secondary);flex:none}
      .lw-paradigm-row{padding:12px 14px;min-width:0}
      .lw-paradigm-row+.lw-paradigm-row{border-block-start:1px solid var(--dsw-alias-border-l2,#8883)}
      .lw-paradigm-row-main{display:flex;align-items:flex-start;gap:10px;min-width:0}
      .lw-paradigm-row-main input{accent-color:var(--dsw-alias-state-business-primary,#3b82f6);inline-size:16px;block-size:16px;flex:none;margin:3px 0 0}
      .lw-paradigm-row-main .lw-paradigm-row-icon{margin-block-start:3px}
      .lw-paradigm-record{display:grid;gap:5px;min-width:0;flex:1;overflow-wrap:anywhere}
      .lw-paradigm-title{background:none;border:0;padding:0;text-align:start;justify-self:start;cursor:pointer;min-width:0;overflow-wrap:anywhere}
      .lw-paradigm-title:hover{text-decoration:underline;text-underline-offset:3px}
      .lw-paradigm-title[aria-current=true]{text-decoration:underline;text-decoration-color:var(--lw-paradigm-accent,currentColor);text-underline-offset:4px}
      .lw-goal-planner{display:grid;gap:12px;min-width:0;container-type:inline-size;color:inherit}
      .lw-goal-planner :is(button,input){font:inherit;color:inherit;min-width:0}
      .lw-goal-planner button{background:transparent;border:1px solid transparent;border-radius:5px;padding:4px 7px;cursor:pointer}
      .lw-goal-planner button:hover,.lw-goal-planner button[aria-pressed=true]{background:color-mix(in srgb,var(--lw-paradigm-accent,#6879d9) 15%,transparent)}
      .lw-goal-planner :is(button,input):focus-visible{outline:2px solid var(--dsw-focus-ring-color,#6978da);outline-offset:1px}
      .lw-goal-stages,.lw-goal-toolbar,.lw-goal-toolbar>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .lw-goal-toolbar{justify-content:space-between}
      .lw-goal-stage{flex:1 1 150px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;padding:8px 10px;border:1px solid var(--lw-border,#8884);border-radius:8px}
      .lw-goal-stage progress{grid-column:1/-1;grid-row:2;width:100%;height:6px;accent-color:var(--lw-paradigm-accent,#6779d3)}
      .lw-goal-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,32%);gap:12px;align-items:start}
      .lw-goal-calendar,.lw-goal-agenda,.lw-goal-board>section{min-width:0;border:1px solid var(--lw-border,#8884);border-radius:8px;padding:8px}
      .lw-goal-agenda,.lw-goal-board,.lw-goal-form{display:grid;gap:7px}
      .lw-goal-form{padding-top:8px;border-top:1px solid var(--lw-border,#8884)}
      .lw-goal-form input{max-width:100%}
      .lw-goal-form button[type=submit]{border:1px solid var(--lw-border,#8884)}
      .lw-goal-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin-top:6px}
      .lw-goal-days[data-scale=日]{grid-template-columns:minmax(0,1fr)}
      .lw-goal-weekday{text-align:center;font-size:var(--lw-ui-xs,12px);opacity:.8}
      .lw-goal-day{border:1px solid var(--lw-border,#8884);border-radius:5px;min-height:66px;min-width:0;padding:2px;overflow:hidden}
      .lw-goal-day[data-outside=true]{opacity:.6}
      .lw-goal-day[data-selected=true],.lw-goal-day[data-drop=true]{border-color:var(--lw-paradigm-accent,#6779d3)}
      .lw-goal-day button[aria-current=date]{font-weight:700}
      .lw-goal-task{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
      .lw-goal-task button{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .lw-goal-task[data-done=true] button{text-decoration:line-through;opacity:.65}
      .lw-goal-day .lw-goal-task{background:color-mix(in srgb,var(--lw-paradigm-accent,#6879d9) 11%,transparent);border-radius:4px;margin:2px 0}
      .lw-goal-day .lw-goal-task button{font-size:var(--lw-ui-xs,12px);padding:2px 4px}
      .lw-goal-task-dates{display:flex;width:100%;flex-wrap:wrap;align-items:center;gap:5px;font-size:var(--lw-ui-xs,12px)}
      .lw-goal-task-dates input,.lw-goal-form input[type=date]{color-scheme:inherit;background:transparent;border:1px solid var(--lw-border,#8884);border-radius:4px;margin-left:4px;padding:2px}
      .lw-goal-board[data-view=看板]{grid-template-columns:repeat(2,minmax(0,1fr))}
      .lw-goal-board h3{margin:0 0 6px;font-size:inherit}
      .lw-goal-ai,.lw-goal-drafts{border-top:1px solid var(--lw-border,#8884);padding-top:7px}
      .lw-goal-drafts h3{margin:0 0 6px;font-size:inherit}
      .lw-goal-draft{display:grid;gap:3px;min-width:0;border-left:2px solid var(--lw-paradigm-accent,#6779d3);padding-left:7px;margin-bottom:8px}
      .lw-goal-draft small,.lw-goal-milestone{color:var(--dsw-alias-label-secondary);font-size:var(--lw-ui-xs,12px)}
      .lw-goal-draft>button{text-align:left;overflow-wrap:anywhere}
      @container (max-width:640px){.lw-goal-columns{grid-template-columns:minmax(0,1fr)}}
      [data-done=true]>.lw-paradigm-record>.lw-paradigm-title{color:var(--dsw-alias-label-secondary);text-decoration:line-through}
      .lw-paradigm-view :is(button,summary,input):focus-visible{outline:2px solid var(--dsw-focus-ring-color,#3b82f6);outline-offset:2px}
      .lw-paradigm-preview{font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-secondary);line-height:1.55;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      .lw-paradigm-meta{font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-secondary);line-height:1.4;font-variant-numeric:tabular-nums}
      .lw-paradigm-fields{display:grid;gap:5px;min-width:0;margin:0;font-size:var(--lw-ui-sm)}
      .lw-paradigm-fields>div{display:grid;grid-template-columns:minmax(0,min(36%,8em)) minmax(0,1fr);gap:8px;overflow-wrap:anywhere}
      .lw-paradigm-fields dt{color:var(--dsw-alias-label-secondary)}
      .lw-paradigm-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;padding:0;list-style:none}
      .lw-paradigm-tile{display:grid;align-content:start;gap:8px;padding:15px;min-width:0;border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:12px;background:var(--dsw-alias-bg-layer-1,Canvas)}
      .lw-paradigm-view[data-layout=branches] .lw-paradigm-tile{border-block-start:2px solid var(--lw-paradigm-accent)}
      .lw-paradigm-steps{list-style:none;display:grid;gap:0;padding:0;margin:0}
      .lw-paradigm-step{position:relative;margin-inline-start:6px;border-inline-start:1px solid var(--dsw-alias-border-l3,#8885);padding:5px 0 16px 20px;min-width:0}
      .lw-paradigm-step::before{content:'';position:absolute;inset-inline-start:-4px;inset-block-start:13px;width:7px;height:7px;border-radius:50%;background:var(--lw-paradigm-accent,var(--dsw-alias-label-secondary))}
      .lw-paradigm-step:last-child{padding-block-end:4px}
      .lw-paradigm-tree{--lw-tree-indent:clamp(11px,2.3vw,23px);display:grid;gap:8px;list-style:none;padding:0}
      .lw-paradigm-tree .lw-paradigm-tree{margin:8px 0 0 var(--lw-tree-indent)}
      .lw-paradigm-node{position:relative;min-width:0}
      .lw-paradigm-tree .lw-paradigm-tree>.lw-paradigm-node::before{content:'';position:absolute;inset-inline-start:calc(-1 * var(--lw-tree-indent) + 5px);inset-block:-8px 0;border-inline-start:1px solid var(--dsw-alias-border-l3,#8885)}
      .lw-paradigm-tree .lw-paradigm-tree>.lw-paradigm-node:last-child::before{inset-block-end:auto;height:28px}
      .lw-paradigm-tree .lw-paradigm-tree>.lw-paradigm-node::after{content:'';position:absolute;inset-inline-start:calc(-1 * var(--lw-tree-indent) + 5px);inset-block-start:20px;width:calc(var(--lw-tree-indent) - 5px);border-block-start:1px solid var(--dsw-alias-border-l3,#8885)}
      .lw-paradigm-tree-row{min-width:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#8883);border-inline-start:2px solid var(--lw-paradigm-accent);border-radius:8px;background:var(--dsw-alias-bg-layer-1,Canvas)}
      .lw-paradigm-progress{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:var(--lw-ui-sm)}
      .lw-paradigm-progress progress{appearance:none;min-width:100px;max-width:100%;height:6px;flex:1;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-interactive-bg-hover,#8883)}
      .lw-paradigm-progress progress::-webkit-progress-bar{background:var(--dsw-alias-interactive-bg-hover,#8883)}
      .lw-paradigm-progress progress::-webkit-progress-value{background:var(--lw-paradigm-accent);border-radius:999px}
      .lw-paradigm-progress progress::-moz-progress-bar{background:var(--lw-paradigm-accent);border-radius:999px}
      .lw-run-table{overflow-x:auto}
      .lw-run-table table{width:100%;border-collapse:collapse;text-align:start;font-size:var(--lw-ui-sm);font-variant-numeric:tabular-nums}
      .lw-run-table :is(th,td){padding:9px 12px;text-align:start;border-block-end:1px solid var(--dsw-alias-border-l2,#8883);overflow-wrap:anywhere}
      .lw-run-table thead{background:var(--dsw-alias-bg-layer-1,#8881);color:var(--dsw-alias-label-secondary)}
      .lw-run-table tbody tr:last-child>*{border-block-end:0}
      .lw-fbot-shell[data-paradigm] .lw-bot-pill{padding:4px 7px 4px 0;border-color:transparent;border-radius:8px;background:transparent;box-shadow:none}
      .lw-fbot-shell[data-paradigm] .lw-bot-pill:hover{background:var(--dsw-alias-interactive-bg-hover,#8882);transform:none}
      .lw-fbot-shell[data-paradigm] .lw-bot-pill-name{font-size:var(--lw-ui-md);font-weight:600;letter-spacing:normal}
      .lw-fbot-shell[data-paradigm] :is(.lw-bot-pill-badge,.lw-empty-emblem){border:0;border-radius:var(--dsw-radius-sm,6px);background:color-mix(in srgb,var(--lw-paradigm-accent) 14%,transparent);color:var(--lw-paradigm-accent);box-shadow:none}
      @media(max-width:530px){.lw-paradigm-options{grid-template-columns:repeat(6,minmax(0,1fr))}.lw-paradigm-option{grid-column:span 2}.lw-paradigm-option:nth-child(4){grid-column:2/span 2}}
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
      .lw-dialog-actions{justify-content:flex-end;gap:8px;margin-top:4px}
      .lw-dialog-actions .lw-btn{min-height:36px;border-radius:var(--dsw-radius-md,12px)}
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

      /* Shared theme colors for action buttons and compact controls. */
      .lw-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;height:auto;padding:5px 14px;border:0;border-radius:999px;font-family:inherit;font-size:var(--lw-ui-base);line-height:1.4;font-weight:500;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background-color .14s ease,border-color .14s ease,color .14s ease,opacity .14s ease;color:var(--dsw-alias-label-primary,inherit);background:transparent}
      .lw-btn:disabled{opacity:.4;cursor:not-allowed}
      .lw-btn:focus-visible,.lw-tree :is(.lw-tool,.lw-row-main,.lw-sidebar-empty-btn):focus-visible,.lw-seg-btn:focus-visible,.lw-subtab:focus-visible,.lw-corner-btn:focus-visible,.lw-lib-nav-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-btn-sm{min-height:30px;padding:4px 12px;font-size:var(--lw-ui-sm);line-height:1.4}
      .lw-btn-xs{min-height:26px;padding:2px 10px;font-size:var(--lw-ui-sm);line-height:1.35}
      .lw-btn-primary,.lw-btn-accent{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff)}
      .lw-btn-primary:hover:not(:disabled),.lw-btn-accent:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-label-primary,#0f1115))}
      .lw-btn-secondary{box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsw-alias-border-l3,rgba(128,128,128,.28));color:var(--dsw-alias-label-primary,CanvasText)}
      .lw-btn-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      .lw-btn-ghost{background:transparent;color:var(--dsw-alias-label-secondary)}
      .lw-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary)}
      .lw-btn-danger{background:transparent;color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1));color:var(--dsw-alias-state-error-primary,#b34835)}
      .lw-dialog-actions .lw-btn-danger{color:var(--dsw-alias-state-error-primary,#b34835);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1))}
      .lw-dialog-actions .lw-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b34835) 18%,transparent)}
      .lw-dialog-actions .lw-project-delete-btn{margin-inline-end:auto}

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
      .lw-tree :where(.lw-tool,.lw-row-main),.lw-footer-btn,.lw-lib-nav-btn{font-family:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
      .lw-tree :where(.lw-tool,.lw-row-main):hover,.lw-tree .lw-row-main[aria-current="page"],.lw-footer-btn:hover,.lw-lib-nav-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
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
      .lw-sidebar-empty-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;margin:4px 0;padding:10px 12px;border:1px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.28));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.03));color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--lw-ui-sm);font-weight:500;cursor:pointer;transition:background-color .14s ease,border-color .14s ease,color .14s ease}
      .lw-sidebar-empty-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary)}
      .lw-brand-entry{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;flex:0 1 auto;min-width:0}
      .lw-wordmark{white-space:nowrap;display:block;font-weight:700;font-size:clamp(22px,calc(22px + var(--lw-font-delta) * .6),26px);line-height:1.15;letter-spacing:-.025em}
      .lw-brand-assistant{flex:none;display:block;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:var(--lw-ui-sm,13px);font-weight:500;line-height:1.3;letter-spacing:.01em;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;transition:color .14s ease}
      [class*="logoRow"] button[class*="brand"]:hover .lw-brand-assistant{color:var(--dsw-alias-label-secondary)}
      .lw-brand-assistant[data-active="true"]{color:var(--dsw-alias-label-secondary)}
      [data-sidebar-collapsed="true"] .lw-brand-assistant,[class*="collapsed"] .lw-brand-assistant{display:none}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"]:has(.lw-wordmark){gap:8px;align-items:center}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="brandIdentity"]:has(.lw-wordmark){flex:1 1 auto;min-width:0;height:auto!important;gap:var(--lw-brand-gap,12px);align-items:center;overflow:visible;transition:gap var(--lw-brand-motion)}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="brandName"]:has(.lw-wordmark){flex:1 1 auto;min-width:0;height:auto!important;display:flex;align-items:center;overflow:visible}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"] [class*="brandIdentity"]:has(.lw-wordmark) .lw-brand-mark{width:40px!important;height:40px!important}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"] button[class*="brand"]:has(.lw-wordmark){flex:1 1 auto;min-width:0;height:auto!important;justify-content:flex-start;border-radius:var(--dsw-radius-md,10px);padding:7px 8px 7px 6px;margin-left:-4px;overflow:visible;transition:background-color .14s ease}
      [class*="frame"]:not([data-sidebar-collapsed="true"]) [data-slot="sidebar"]>[class*="root"]:not([class*="collapsed"]) [class*="logoRow"] button[class*="brand"]:has(.lw-wordmark):hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      [data-slot="sidebar"]{--lw-brand-motion:260ms cubic-bezier(.2,.75,.25,1)}
      [data-slot="sidebar"] [class*="logoRow"]:has(.lw-brand-entry){
        max-block-size:calc(64px + max(0px,var(--lw-font-delta)));transition:max-block-size var(--lw-brand-motion),padding-block var(--lw-brand-motion)
      }
      [data-slot="sidebar"] [class*="brandMark"]:has(.lw-brand-mark){
        max-inline-size:40px;max-block-size:40px;transition:max-inline-size var(--lw-brand-motion),max-block-size var(--lw-brand-motion)
      }
      [data-slot="sidebar"] :is(.lw-brand-mark,.lw-wordmark){
        transition:opacity var(--lw-brand-motion),translate var(--lw-brand-motion),visibility var(--lw-brand-motion),max-block-size var(--lw-brand-motion)
      }
      .lw-wordmark{max-block-size:1.15em}
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"] [class*="logoRow"]:has(.lw-brand-entry){
        max-block-size:38px;padding-block:2px
      }
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"]{--lw-brand-gap:0px}
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"] [class*="brandMark"]:has(.lw-brand-mark){max-inline-size:0;max-block-size:0}
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"] :is(.lw-brand-mark,.lw-wordmark){
        opacity:0;translate:0 -14px;visibility:hidden
      }
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"] .lw-wordmark{max-block-size:0}
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"] [data-sidebar-toggle] [class*="railMark"]{display:none}
      [data-lw-assistant-brand-hidden] [data-slot="sidebar"] [data-sidebar-toggle]:has([class*="railMark"]) [class*="panelIcon"]{display:block}
      @media(prefers-reduced-motion:reduce){
        [data-slot="sidebar"]{--lw-brand-motion:0ms}
      }
      [class*="logoRow"] + [class*="newSession"],[data-sidebar-drawer] [class*="newSession"]{display:none!important}
      .lw-brand-mark{display:block;flex:none;object-fit:contain}
      [class*="panelList"] [class*="moreAnchor"],[class*="panelList"] [class*="panelUnpin"],[data-lw-hidden="1"]{display:none!important}
      [data-subagent-action]{display:none!important}
      [data-shortcut-modal="settings"] [data-slot="settings.action"],[data-shortcut-modal="settings"] [data-slot="settings.general.item"]>*:has([aria-label*="Session Log"]){display:none!important}
      [data-sidebar-drawer]:not([data-sidebar-collapsed="true"]) [class*="panelList"] button{font-size:var(--lw-ui-base);min-height:calc(32px + max(0px,var(--lw-font-delta) * 1.1));height:auto}
      [role="group"][aria-label="模型与推理等级"],[role="menu"][aria-label="模型与推理等级"]:not(:has(.lw-mo-root)):has([role="menuitemradio"]){padding-top:30px}
      .lw-mo-native-back{position:absolute;z-index:1;inset:2px 4px auto;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas)))}
      [role="menu"]:has(.lw-mo-context)>button[role="menuitem"]{display:none}
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
      .lw-rail-popover :where(.lw-tool,.lw-row-main){font-family:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
      .lw-rail-popover :where(.lw-tool,.lw-row-main):hover,.lw-rail-popover .lw-row-main[aria-current="page"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-rail-popover .lw-tool{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:var(--dsw-radius-md,8px);padding:0;flex:none;color:var(--dsw-alias-label-secondary);transition:background-color .14s ease,color .14s ease}
      .lw-rail-popover .lw-tool .lw-icon,.lw-session-popover .lw-tool .lw-icon{width:14px;height:14px}
      .lw-rail-popover .lw-tool:hover{color:var(--dsw-alias-label-primary)}
      .lw-rail-popover .lw-tool:focus-visible,.lw-session-popover .lw-tool:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-rail-popover .lw-tier{margin:0;padding-inline-start:0;border-inline-start:0}
      .lw-rail-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .lw-rail-popover-head strong{font-size:var(--lw-ui-base);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}

      /* Top-Left Global Sessions & Top-Right Corner Direct Right-Sidebar Toggle */
      .lw-corner-wrap{position:relative;display:inline-flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%;-webkit-app-region:no-drag}
      .lw-corner-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:var(--lw-ui-base);line-height:1.4;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .14s ease,color .14s ease,border-color .14s ease}
      .lw-corner-btn:hover,.lw-corner-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-corner-btn .lw-icon{width:16px;height:16px}
      .lw-project-corner{flex-wrap:nowrap}
      @container (max-width:460px){
        .lw-project-corner{gap:4px}
        .lw-project-corner .lw-corner-btn{gap:4px;padding-inline:9px}
        .lw-project-corner .lw-corner-label{display:none}
      }
      .lw-project-task-list{margin:0;padding:0;list-style:none}
      .lw-project-task-list li+li{border-top:.5px solid var(--dsw-alias-border-l2)}
      .lw-project-task-list .lw-more{display:grid;gap:4px;min-height:44px;overflow-wrap:anywhere}
      .lw-project-task-content{display:grid;align-content:start;gap:12px}
      .lw-project-task-group{display:grid;gap:6px}
      .lw-project-task-group h3{margin:0;font-size:var(--lw-ui-base)}
      .lw-project-task-item{min-width:0;border:.5px solid var(--dsw-alias-border-l2,#8885);border-radius:10px}
      .lw-project-task-item summary{list-style:none;display:flex;align-items:flex-start;gap:8px;justify-content:space-between;padding:9px 10px;cursor:pointer}
      .lw-project-task-item summary::-webkit-details-marker{display:none}
      .lw-project-task-item summary .lw-icon{flex:none;margin-top:2px}
      .lw-project-task-item[open] summary .lw-icon{transform:rotate(90deg)}
      .lw-project-task-item .lw-project-task-title{min-width:0;flex:1;display:grid;gap:3px;overflow-wrap:anywhere}
      .lw-project-task-item .lw-tag{flex:none}
      .lw-project-task-detail{display:grid;gap:8px;border-top:.5px solid var(--dsw-alias-border-l2,#8885);padding:10px;overflow-wrap:anywhere}
      .lw-project-task-detail p{margin:0;white-space:pre-wrap}
      .lw-project-task-detail .lw-actions{flex-wrap:wrap}
      [data-conversation-header-leading],[data-conversation-header-corner],[data-slot="conversation.header.leading"],[data-slot="conversation.session.header.corner"]{display:inline-flex;align-items:center;min-height:36px}
      [data-conversation-content] :is([class*="headerBar"],[class*="sessionHeader"],[class*="chatHeader"],[class*="topBar"],header):has([data-conversation-header-leading],[data-conversation-header-corner],[data-slot="conversation.header.leading"]){min-height:56px;box-sizing:border-box}
      .lw-session-popover{position:fixed;z-index:96;width:308px;max-width:calc(100vw - 24px);max-height:min(68vh,460px);display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px;padding:10px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas)));box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,none);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-base)}
      .lw-session-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .lw-session-popover-head strong{font-size:var(--lw-ui-base);font-weight:600;color:var(--dsw-alias-label-primary);letter-spacing:0}
      .lw-session-popover-list{display:grid;gap:2px;overflow:auto;min-height:0;padding-right:2px}
      .lw-session-popover :where(.lw-tool,.lw-row-main){font-family:inherit;color:inherit;cursor:pointer;border:0;background:transparent}
      .lw-session-popover :where(.lw-tool,.lw-row-main):hover,.lw-session-popover .lw-row-main[aria-current="page"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-session-popover [aria-current="page"]{font-weight:600}
      .lw-session-popover .lw-row-main{padding:6px 8px;min-height:34px;justify-content:space-between;gap:8px}
      .lw-session-popover .lw-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-session-popover .lw-row-time{flex:none;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
      .lw-session-popover .lw-tool{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:var(--dsw-radius-md,8px);padding:0;flex:none;color:var(--dsw-alias-label-secondary);transition:background-color .14s ease,color .14s ease}
      .lw-session-popover .lw-tool:hover{color:var(--dsw-alias-label-primary)}
      .lw-session-popover .lw-tool-danger:hover{color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,38,38,.1))}
      header:has(.lw-active-profile-entry){--lw-active-avatar-size:clamp(54px,8.4vh,74px);position:relative;margin-block-end:calc(var(--lw-active-avatar-size) + 46px)}
      .lw-active-profile-entry{position:absolute;inset-block-start:calc(100% + 4px);left:50%;translate:-50% 0;z-index:5;max-width:calc(100% - 24px);--lw-identity-avatar-size:var(--lw-active-avatar-size);--lw-identity-gap:5px;--lw-identity-padding:4px 14px 6px;--lw-identity-name-size:var(--lw-ui-md);--lw-identity-badge-size:22px}
      .lw-active-profile-entry .lw-hero-entry-name{max-width:100%}
      .lw-active-profile-entry .lw-hero-avatar-badge .lw-icon{width:11px;height:11px}
      .lw-assistant-flight{position:fixed;inset:0;z-index:110;pointer-events:none}
      .lw-welcome{box-sizing:border-box;display:grid;place-content:center;justify-items:center;gap:clamp(16px,3vh,24px);width:100%;height:100%;padding:24px;text-align:center}
      .lw-welcome .lw-brand-mark{width:clamp(64px,13vmin,96px);height:auto;aspect-ratio:1}
      .lw-welcome h1{margin:0;color:var(--dsw-alias-label-primary);font-size:clamp(24px,4vmin,34px);font-weight:600;line-height:1.3}
      @media(prefers-reduced-motion:no-preference){
        .lw-welcome>*{animation:lw-welcome-enter .25s ease-out both}
        @keyframes lw-welcome-enter{from{opacity:0;transform:translateY(6px)}}
      }
      html[data-lw-room="global"] header [class*="titleGroup"],html[data-lw-room="global"] header [class*="headerTitle"],html[data-lw-room="global"] header [class*="sessionTitle"]{display:none!important}html[data-lw-room="global"] [data-slot="conversation.input.model"],html[data-lw-room="global"] [data-slot="conversation.input.permission"],html[data-lw-room="global"] [data-slot="conversation.input.plan"],html[data-lw-room="global"] [class*="uV2eYG_select"],html[data-lw-room="global"] [class*="uV2eYG_modes"]{display:none!important}
      html[data-lw-room="global"] [data-composer-card] button[class$="_add"]{display:none!important}
      html[data-lw-room="global"] [data-chat-flow-kind="turn-process"],
      html[data-lw-room="global"] [data-step-process],
      html[data-lw-room="global"] [data-chat-call-id],
      html[data-lw-room="global"] [data-tool]{display:none!important}
      html[data-lw-room="global"] [class*="thinkBody"]{display:none!important}
      html[data-lw-room="global"] [class*="lcKema_root"]:not([data-preview]) [class*="lcKema_summary"],
      html[data-lw-room="global"] [class*="lcKema_root"]:not([data-preview]) [class*="lcKema_separator"]{display:flex!important;align-items:center}
      html[data-lw-room="global"] [data-conversation-content]{--dsh-composer-card-max-width:740px;--dsh-composer-side-clearance:clamp(16px,3.5vw,40px)}
      html[data-lw-room="global"] [data-composer-card]{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:end;gap:0 6px}
      html[data-lw-room="global"] [data-composer-card]>*{grid-column:1/-1}
      html[data-lw-room="global"] [data-composer-card]>[data-input-scroll]{grid-column:2;grid-row:2;align-self:center;margin:0;max-height:120px;font-size:var(--lw-ui-body);line-height:22px}
      html[data-lw-room="global"] [data-composer-input]{min-height:32px;padding:5px 4px}
      html[data-lw-room="global"] [data-input-scroll] [data-composer-placeholder]{inset:5px 4px auto;color:var(--dsw-alias-label-tertiary)}
      html[data-lw-room="global"] [data-composer-card]>[class$="_row"]{display:contents}
      html[data-lw-room="global"] [data-composer-card] [class$="_tools"]{grid-column:1;grid-row:2;gap:0}
      html[data-lw-room="global"] [data-composer-card] [class*="_trailing"]{grid-column:3;grid-row:2;margin:0;gap:4px}
      html[data-lw-room="global"] [data-composer-card] button[class*="_primary"]{width:32px;height:32px;border-radius:50%;padding:0;transform:none;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff)}
      html[data-lw-room="global"] [data-composer-card] button[class*="_primary"]:disabled{opacity:.26}
      .lw-add-action.lw-btn,.lw-add-action.lw-corner-btn,.lw-add-action.lw-sidebar-empty-btn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l4,rgba(128,128,128,.32))}
      .lw-add-action .lw-icon{width:14px;height:14px;flex:none}
      .lw-turn-progress{box-sizing:border-box;width:100%;max-width:740px;min-width:0;display:flex;align-items:center;gap:8px;margin:0 auto 4px;padding:4px 8px;color:var(--dsw-alias-label-secondary);font-size:var(--lw-ui-sm);line-height:1.4}
      .lw-turn-progress img{width:18px;height:18px;flex:none}
      .lw-turn-progress [role="status"]{display:flex;flex:1;align-items:baseline;gap:6px;min-width:0}
      .lw-turn-phase,.lw-turn-topic{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-turn-phase{flex:0 1 auto;color:var(--dsw-alias-label-primary)}
      .lw-turn-topic{flex:1 1 0;font-size:var(--lw-ui-xs)}
      .lw-turn-progress time{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
      .lw-turn-progress button{flex:none}
      [data-chat-running]:has(>.lw-assistant-progress)>:not(.lw-assistant-progress){display:none!important}
      .lw-assistant-progress{width:100%;min-width:0}
      .lw-assistant-progress .lw-turn-progress{max-width:none;margin:0;padding:0}
      .lw-asst-settings{display:grid;gap:18px;padding:8px 2px 28px;max-width:640px;font-family:inherit;font-size:14px;line-height:22px;font-weight:400}
      .lw-asst-settings h2{margin:0;font-size:16px;font-weight:500;line-height:24px;color:var(--dsw-alias-label-primary)}
      .lw-asst-settings .lw-hint{margin:0;font-size:12px;line-height:18px;font-weight:400}
      .lw-asst-choices{display:grid;gap:8px}
      .lw-asst-choice{display:grid;gap:4px;width:100%;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));border-radius:14px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.03));text-align:start;cursor:pointer;font:inherit;color:inherit}
      .lw-asst-choice:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}
      .lw-asst-choice[data-selected="true"]{border-color:var(--dsw-alias-state-business-primary,#3b82f6);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary,#3b82f6);background:var(--dsw-alias-bg-layer-1,rgba(38,49,72,.05))}
      .lw-asst-choice strong{font-size:14px;font-weight:500;line-height:22px}
      .lw-asst-choice span{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary);line-height:18px}
      .lw-sel-trigger{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:38px;padding:7px 10px 7px 12px;border:0;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:var(--lw-ui-base);font-weight:400;line-height:1.5;text-align:start;cursor:pointer;transition:background-color .14s ease}
      .lw-sel-trigger:hover:not(:disabled),.lw-sel-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,.17))}
      .lw-sel-trigger:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-sel-trigger:disabled{opacity:.5;cursor:not-allowed}
      .lw-sel-trigger[data-inline="true"]{width:auto;min-height:32px;padding:4px 8px 4px 12px}
      .lw-sel-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-sel-text[data-placeholder="true"]{color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-sel-trigger .lw-icon{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-sel-menu{position:fixed;z-index:10000;box-sizing:border-box;display:grid;gap:2px;align-content:start;overflow:auto;padding:6px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas)));box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,none);color:var(--dsw-alias-label-primary,inherit);font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-base);font-weight:400;line-height:1.5}
      .lw-sel-option{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:36px;padding:6px 10px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;user-select:none}
      .lw-sel-option>span{min-width:0;overflow-wrap:anywhere}
      .lw-sel-option[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-sel-option[aria-disabled="true"]{opacity:.45;cursor:default}
      .lw-sel-option .lw-icon{width:16px;height:16px;flex:none}
      .lw-asst-select .lw-sel-trigger{font-size:14px;min-height:36px;border-radius:10px}
      .lw-asst-select{display:grid;gap:6px;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-primary)}
      .lw-asst-select select{box-sizing:border-box;width:100%;font:inherit;font-size:14px;font-weight:400;line-height:22px;min-height:36px;border-radius:10px;padding:6px 10px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);color:inherit}

      .lw-rpane{box-sizing:border-box;height:100%;overflow:auto;padding:16px 18px 28px;display:grid;align-content:start;gap:14px;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-primary)}
      .lw-rpane-card{padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);display:grid;gap:8px}
      .lw-rpane-card h3{margin:0;font-size:var(--lw-ui-base);font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px}

      /* Right Sidebar Links & Clean Hero Chrome */
      .lw-hero-ctx-btn{border:0;background:transparent;padding:2px 6px;border-radius:6px;font:inherit;font-size:var(--lw-ui-sm);line-height:1.45;color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:start;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-hero-ctx-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      [data-conversation-content]{container-type:inline-size;container-name:lwchat}
      [data-content-phase="hero"] [class*="heroWorkspaceRow"]>:first-child{display:none}
      [data-content-phase="hero"] [data-composer-card]:has([data-composer-input][aria-haspopup="menu"]){display:none}
      [data-conversation-content] [class*="previewBadge"]:empty{display:none}

      /* Global Assistant Hero Entry (Stacked Avatar + Name, Enlarged & Elevated) */
      [data-content-phase="hero"] [class*="scrollBody"]:has(.lw-hero-profile-entry){justify-content:flex-start!important;padding-top:clamp(22px,8.5vh,84px)}
      [data-content-phase="hero"] [class*="composerHero"]:has(.lw-hero-profile-entry){gap:clamp(16px,3.8vh,36px)}
      [data-content-phase="hero"] [class*="headline"]:has(.lw-hero-profile-entry) [class*="titleGroup"]{display:none!important}
      .lw-assistant-identity{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--lw-identity-gap,12px);padding:var(--lw-identity-padding,14px 28px 12px);border:0;border-radius:24px;corner-shape:round;background:transparent;color:inherit;font-family:inherit;cursor:pointer;text-align:center;transition:background-color .16s ease,transform .16s ease}
      .lw-assistant-identity:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.07))}
      .lw-assistant-identity:active{transform:scale(.99)}
      .lw-assistant-identity:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:4px}
      .lw-hero-avatar-frame{position:relative;width:var(--lw-identity-avatar-size,92px);height:var(--lw-identity-avatar-size,92px);border-radius:50%;corner-shape:round;display:grid;place-items:center;flex:none;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));box-shadow:0 6px 22px rgba(0,0,0,.06);transition:box-shadow .18s ease,border-color .18s ease,transform .18s ease}
      .lw-assistant-identity:hover .lw-hero-avatar-frame{border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.35));box-shadow:0 10px 28px rgba(0,0,0,.1);transform:translateY(-1px)}
      .lw-hero-avatar-frame[data-custom="false"] .lw-hero-avatar-img{width:74%;height:74%;object-fit:contain}
      .lw-hero-avatar-frame[data-custom="true"] .lw-hero-avatar-img{width:calc(100% - 2px);height:calc(100% - 2px);border-radius:50%;corner-shape:round;object-fit:cover}
      .lw-hero-avatar-badge{position:absolute;right:0;bottom:0;width:var(--lw-identity-badge-size,26px);height:var(--lw-identity-badge-size,26px);border-radius:50%;corner-shape:round;display:grid;place-items:center;background:var(--dsw-alias-bg-base,Canvas);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));box-shadow:0 2px 8px rgba(0,0,0,.12);color:var(--dsw-alias-label-secondary);opacity:.85;transition:opacity .15s ease,color .15s ease,transform .15s ease}
      .lw-hero-avatar-badge .lw-icon{width:13px;height:13px}
      .lw-assistant-identity:hover .lw-hero-avatar-badge{opacity:1;color:var(--dsw-alias-label-primary);transform:scale(1.06)}
      .lw-hero-entry-name{font-size:var(--lw-identity-name-size,clamp(28px,calc(28px + var(--lw-font-delta) * .85),36px));line-height:1.22;font-weight:600;letter-spacing:-.02em;color:var(--dsw-alias-label-primary);max-width:min(520px,80vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-hero-entry-tagline{font-size:var(--lw-ui-base);line-height:1.45;font-weight:400;color:var(--dsw-alias-label-tertiary);max-width:min(460px,78vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-height:620px){
        [data-content-phase="hero"] [class*="scrollBody"]:has(.lw-hero-profile-entry){padding-top:16px}
        .lw-hero-profile-entry{--lw-identity-avatar-size:76px}
      }

      .lw-side-dialog{--lw-side-inset:12px;box-sizing:border-box;position:fixed;inset:var(--lw-side-inset) var(--lw-side-inset) var(--lw-side-inset) auto;margin:0;width:min(440px,calc(100% - 2 * var(--lw-side-inset)));max-width:none;height:auto;max-height:none;overflow:hidden;padding:0;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:22px;corner-shape:round;color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-base,Canvas);box-shadow:var(--dsw-elevation-prominent,0 20px 48px rgba(0,0,0,.22));font-family:var(--dsw-font-family,inherit);font-size:var(--lw-ui-base);line-height:1.5}
      .lw-side-dialog[open]{display:grid;grid-template-rows:auto minmax(0,1fr);animation:lw-side-enter .18s ease-out}
      @keyframes lw-side-enter{from{opacity:0;transform:translateX(12px)}}
      @media(prefers-reduced-motion:reduce){.lw-side-dialog[open]{animation:none}}
      .lw-side-dialog::backdrop{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32));backdrop-filter:var(--dsw-mask-blur,none)}
      .lw-side-dialog *{box-sizing:border-box}
      .lw-side-dialog-chrome{margin:0;padding:12px 20px;min-width:0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12))}
      .lw-side-dialog-content{min-width:0;overflow:auto;overscroll-behavior:contain;padding:14px 20px 24px}
      .lw-project-settings{display:grid;align-content:start;gap:16px;min-width:0}
      .lw-source-list{list-style:none;margin:0;padding:0;border:.5px solid var(--dsw-alias-border-l3);border-radius:12px}
      .lw-source-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;padding:10px 12px}
      .lw-source-row+.lw-source-row{border-top:.5px solid var(--dsw-alias-border-l3)}
      .lw-source-row>.lw-icon{flex:none;color:var(--dsw-alias-label-secondary)}
      .lw-source-label{flex:1 1 150px;min-width:0;overflow-wrap:anywhere}
      .lw-source-picker{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .lw-source-picker input{flex:1 1 160px;min-width:0}
      .lw-source-picker button{flex:none}
      .lw-create-sources{display:grid;gap:8px;min-width:0;margin:0;padding:0;border:0}
      .lw-create-sources legend{margin-bottom:4px;padding:0;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-create-sources .lw-hint{margin:0}
      @media(max-width:480px){.lw-side-dialog{--lw-side-inset:8px}.lw-side-dialog-chrome,.lw-side-dialog-content{padding-inline:16px}}
      .lw-ap-dialog{--lw-ap-avatar-size:96px}
      @media(max-height:560px){.lw-ap-dialog{--lw-ap-avatar-size:56px}.lw-ap-chrome{padding-block:6px}.lw-ap-dialog .lw-ap-tabs{margin-top:8px}}
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
      .lw-ap-avatar-box{position:relative;width:var(--lw-ap-avatar-size);height:var(--lw-ap-avatar-size);border-radius:50%;corner-shape:round;display:grid;place-items:center}
      .lw-ap-avatar-circle{width:100%;height:100%;border-radius:50%;corner-shape:round;display:grid;place-items:center;overflow:hidden;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}
      .lw-ap-avatar-circle[data-custom="false"] img{width:72%;height:72%;object-fit:contain}
      .lw-ap-avatar-circle[data-custom="true"] img{width:100%;height:100%;border-radius:50%;corner-shape:round;object-fit:cover}
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
      .lw-ap-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;margin:14px 0 0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12))}
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
      .lw-mo-root{display:flex;flex-direction:column;gap:2px;min-height:0;outline:none;font-family:inherit;font-size:13px;font-weight:400;line-height:20px}
      .lw-mo-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.18));flex:none}
      .lw-mo-cell{box-sizing:border-box;border-radius:var(--dsw-radius-md,8px);width:100%;min-height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:transparent;border:none;outline:none;align-items:center;gap:6px;padding:4px 8px;font:inherit;font-size:13px;line-height:20px;display:flex}
      .lw-mo-cell:hover:not(:disabled),.lw-mo-cell:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
      .lw-mo-cell:disabled{opacity:.48;cursor:default}
      .lw-mo-cell-label{white-space:nowrap;flex:none}
      .lw-mo-cell-val{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:1;overflow:hidden}
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
      .lw-page-topbar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;min-height:56px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));background:var(--dsw-alias-bg-base,Canvas);z-index:8}
      [data-sidebar-collapsed="true"] .lw-page-topbar{padding-left:58px}
      [data-sidebar-collapsed="true"] .lw-split-host .lw-page-topbar,[data-sidebar-collapsed="true"] .lw-split-grid>.lw-page+.lw-page .lw-page-topbar{padding-left:20px}
      .lw-companion-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;corner-shape:round;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:var(--lw-ui-base);line-height:1.4;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .14s ease,color .14s ease,border-color .14s ease}
      .lw-companion-btn:hover,.lw-companion-btn[aria-pressed="true"],.lw-companion-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-companion-btn .lw-icon{width:16px;height:16px}
      .lw-pane-close{width:36px;height:36px;padding:0;border-radius:999px;corner-shape:round;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-secondary);display:inline-grid;place-items:center;flex:none;cursor:pointer;transition:background-color .14s ease,color .14s ease,border-color .14s ease}
      .lw-pane-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-pane-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-pane-close .lw-icon{width:16px;height:16px}

      .lw-fbot-shell{flex:1;min-height:0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);position:relative;overflow:hidden}
      .lw-fbot-main{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;font-family:var(--dsw-font-family,inherit);--lw-bot-gutter:clamp(14px,3vw,28px)}
      .lw-fbot-main .lw-fbot-scroll{flex:0 0 clamp(110px,var(--lw-board-size,58%),calc(100% - 110px));min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:0}
      .lw-fbot-scroll>.lw-fbot-center{display:flex;flex:1;flex-direction:column;min-height:0;max-width:none;gap:0}
      .lw-fbot-scroll .lw-fbot-head{padding:6px var(--lw-bot-gutter);flex:none}
      .lw-bot-board{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:10px var(--lw-bot-gutter);container-type:size}
      .lw-bot-conversation{display:flex;flex:1 1 0;min-height:0;flex-direction:column;background:var(--dsw-alias-bg-base,Canvas)}
      .lw-bot-divider{position:relative;flex:0 0 8px;cursor:ns-resize;touch-action:none;outline-offset:-2px}
      .lw-bot-divider::after{content:'';position:absolute;inset:3px 0 auto;border-block-start:.5px solid var(--dsw-alias-border-l2,#8884)}
      .lw-bot-divider:is(:hover,:focus-visible)::after{border-color:var(--dsw-alias-border-l4,#8888)}
      .lw-bot-conversation-log{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px var(--lw-bot-gutter) 8px}
      .lw-bot-conversation-log-inner{max-width:var(--dsh-composer-card-max-width,740px);margin:0 auto}
      .lw-bot-conversation .lw-bot-turns{margin:0}
      .lw-bot-conversation .lw-bot-msg[data-role=assistant]{padding-inline:0;background:none;border:0}
      .lw-bot-conversation .lw-bot-msg[data-role=user]{border-radius:var(--dsw-radius-lg,14px)}
      .lw-bot-conversation .lw-fbot-composer-wrap{padding-block:4px 9px}
      .lw-bot-conversation .lw-fbot-composer{max-width:var(--dsh-composer-card-max-width,740px);border-radius:var(--dsw-radius-lg,14px);box-shadow:none}
      .lw-bot-canvas{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2,#8883);border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-1,Canvas)}
      .lw-bot-board .lw-bot-canvas{height:max(155px,100cqh)}
      .lw-canvas-toolbar{display:flex;align-items:center;gap:8px;min-width:0;flex:none;padding:5px 10px;border-block-end:.5px solid var(--dsw-alias-border-l2,#8883)}
      .lw-canvas-categories{display:flex;gap:6px;overflow:auto;flex:1;min-width:0;padding:2px}
      .lw-canvas-controls{display:flex;align-items:center;gap:2px;flex:none;margin-inline-start:auto;font-size:var(--lw-ui-xs);font-variant-numeric:tabular-nums}
      .lw-canvas-controls button{min-width:26px;min-height:26px;padding:3px 6px}
      .lw-canvas-categories button{flex:none;border:0;border-radius:var(--dsw-radius-sm,6px);padding:4px 9px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--lw-ui-sm);line-height:1.45;cursor:pointer}
      .lw-canvas-categories button:hover{background:var(--dsw-alias-interactive-bg-hover,#8881)}
      .lw-canvas-categories button[aria-pressed=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,#8882);font-weight:500}
      .lw-canvas-viewport{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;cursor:grab;touch-action:none}
      .lw-canvas-viewport[data-panning=true]{cursor:grabbing;user-select:none}
      .lw-canvas-frame{position:relative;overflow:clip}
      .lw-canvas-stage{box-sizing:border-box;position:absolute;inset:0 auto auto 0;display:grid;grid-auto-flow:column;grid-auto-columns:240px;gap:36px;width:max-content;min-height:188px;padding:20px 24px;align-items:center;transform-origin:top left}
      .lw-dialog.lw-canvas-full{inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;padding:12px;border:0;border-radius:0;display:flex;flex-direction:column}
      .lw-canvas-full .lw-bot-canvas{flex:1;min-height:0}
      .lw-canvas-card[data-draft=true]{border-style:dashed}
      .lw-canvas-node-actions{display:flex;gap:4px;justify-content:flex-end;padding:0 7px 6px}
      .lw-canvas-node-actions button{min-width:26px;font-size:var(--lw-ui-base)}
      .lw-canvas-live{margin:0;padding:5px 9px;color:var(--dsw-alias-label-secondary);font-size:var(--lw-ui-xs)}
      .lw-canvas-lane{display:grid;align-content:center;gap:13px;min-width:0;z-index:1}
      .lw-canvas-lane h3{margin:0;font-size:var(--lw-ui-sm);font-weight:500;color:var(--dsw-alias-label-secondary)}
      .lw-canvas-card{box-sizing:border-box;position:relative;min-width:0;width:100%;max-width:360px;align-self:start;border:.5px solid var(--dsw-alias-border-l3,#8884);border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-base,Canvas)}
      .lw-canvas-card:has(button):hover,.lw-canvas-card[data-current=true]{border-color:var(--dsw-alias-border-l4,#8887);background:var(--dsw-alias-bg-layer-2,Canvas)}
      .lw-canvas-card-body{box-sizing:border-box;display:grid;gap:5px;width:100%;min-width:0;border:0;padding:10px 11px;background:none;color:inherit;text-align:start;font:inherit;border-radius:7px;overflow-wrap:anywhere}
      button.lw-canvas-card-body{cursor:pointer}
      .lw-canvas-card strong{font-size:var(--lw-ui-base);font-weight:550;line-height:1.45}
      .lw-canvas-thumb{width:100%;height:74px;object-fit:contain;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1,Canvas)}
      .lw-canvas-card :is(button,input):focus-visible,.lw-canvas-categories button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,#3b82f6);outline-offset:2px}
      .lw-canvas-card-meta{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-secondary)}
      .lw-canvas-edges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;color:color-mix(in srgb,var(--lw-paradigm-accent,#7891ba) 74%,var(--dsw-alias-label-secondary))}
      .lw-canvas-edges path{fill:none;stroke:currentColor;stroke-width:1.35}
      .lw-canvas-edges circle{fill:currentColor}
      .lw-canvas-attachment{margin:0;border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:8px;padding:8px 10px;justify-content:space-between;overflow-wrap:anywhere}
      .lw-canvas-detail-body{display:grid;gap:12px;min-width:0}
      .lw-record-dialog .lw-dialog-head{align-items:flex-start;margin-bottom:0}
      .lw-record-heading{min-width:0;display:grid;gap:10px}
      .lw-record-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;color:var(--dsw-alias-label-secondary)}
      .lw-record-dialog .lw-record-heading h2{margin:0;max-inline-size:38ch;font-size:clamp(1.22rem,3.1vw,1.68rem);line-height:1.32;font-weight:650;letter-spacing:-.025em;text-wrap:balance;overflow-wrap:anywhere}
      .lw-record-dialog .lw-canvas-detail-body{gap:0}
      .lw-record-content{display:grid;gap:16px;min-width:0;padding-block:18px 4px}
      .lw-record-markdown{color:var(--dsw-alias-label-primary,CanvasText);font-size:var(--lw-ui-base);line-height:1.72}
      .lw-record-markdown p{margin-bottom:12px}
      .lw-record-markdown h2,.lw-record-markdown h3{margin-block:16px 7px}
      .lw-record-markdown pre{padding:11px 13px;border-radius:8px;background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-layer-1,#8881))}
      .lw-record-sections{display:grid;gap:4px}
      .lw-record-section{min-width:0;display:grid;grid-template-columns:minmax(74px,14%) minmax(0,1fr);gap:6px 14px;padding:11px 0;border-top:.5px solid var(--dsw-alias-border-l2,#8883)}
      .lw-record-section h3{margin:2px 0 0;font-size:var(--lw-ui-sm);line-height:1.45;font-weight:650;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-record-section[data-kind="finding"]{padding-inline:12px;border-top-color:transparent;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4474be) 8%,var(--dsw-alias-bg-layer-2,Canvas))}
      .lw-record-section[data-kind="finding"] h3{color:var(--dsw-alias-state-business-primary,#4474be)}
      .lw-record-content .lw-paradigm-fields{margin:0;grid-template-columns:repeat(auto-fit,minmax(min(100%,195px),1fr))}
      .lw-record-content .lw-fbot-detail-figure{margin:0}
      .lw-record-content .lw-push-source{margin:0;padding-block:12px 0}
      .lw-record-actions{padding-block-start:4px}
      .lw-record-delete{margin-inline-end:auto}
      .lw-record-delete-confirm{padding:9px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger,#b3483511)}
      @media(max-width:560px){.lw-record-section{grid-template-columns:1fr}.lw-record-content{gap:13px;padding-block-start:14px}.lw-record-section h3{margin:0}}
      .lw-dynamic-browser{display:block;width:100%;height:min(60vh,620px);border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-base,Canvas)}
      .lw-fbot-tasks-toggle[aria-pressed="true"],.lw-fbot-tasks-toggle[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
      .lw-bot-workbench{width:min(500px,calc(100% - 2 * var(--lw-side-inset)))}
      .lw-bot-workbench-head{display:flex;align-items:center;gap:10px;min-width:0}
      .lw-bot-workbench-identity{display:grid;gap:2px;min-width:0}
      .lw-bot-workstack{display:grid;gap:10px;min-width:0}
      .lw-bot-workstack :is(h3,h4,p,figure){margin:0}
      .lw-bot-workstack :is(h3,h4){font-size:var(--lw-ui-base);font-weight:600}
      .lw-bot-brief{display:grid;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-alias-bg-layer-1,Canvas);overflow-wrap:anywhere}
      .lw-bot-brief p{margin:0;white-space:pre-wrap;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
      .lw-bot-worknav{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2,#8884);margin:4px 0 2px}
      .lw-bot-worknav button{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,GrayText);font:inherit;cursor:pointer}
      .lw-bot-worknav button[aria-pressed=true]{border-bottom-color:var(--dsw-alias-state-business-primary,#3b82f6);color:var(--dsw-alias-label-primary,CanvasText);font-weight:600}
      .lw-bot-worknav button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
      .lw-bot-workbench :is(.lw-bot-worknav button,.lw-bot-thread,summary):focus-visible{outline:2px solid var(--dsw-focus-ring-color,#3b82f6);outline-offset:1px}
      .lw-bot-workline{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .lw-bot-thread-list,.lw-bot-delivery-list{list-style:none;display:grid;gap:4px;padding:0;margin:0}
      .lw-bot-thread{display:flex;align-items:center;gap:10px;width:100%;padding:8px;text-align:start;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;cursor:pointer;overflow-wrap:anywhere}
      .lw-bot-thread:hover,.lw-bot-thread[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}
      .lw-bot-thread-label{display:grid;gap:2px;min-width:0;flex:1}
      .lw-bot-thread strong{font-weight:550}
      .lw-bot-thread small{color:var(--dsw-alias-label-tertiary,GrayText);font-size:var(--lw-ui-xs)}
      .lw-bot-disclosure{padding:8px 10px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,#8884)}
      .lw-bot-disclosure summary{cursor:pointer;font-size:var(--lw-ui-sm)}
      .lw-bot-disclosure[open]>summary{margin-bottom:8px}
      .lw-bot-delivery-list li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;font-size:var(--lw-ui-sm)}
      .lw-bot-artifact-img{display:block;max-width:100%;max-height:48vh;object-fit:contain;margin:auto;border-radius:var(--dsw-radius-md,8px)}
      .lw-bot-output{margin:0;max-height:280px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,#8881);font-size:var(--lw-ui-sm)}
      .lw-bot-chart{min-width:0;display:grid;gap:4px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:var(--dsw-radius-md,8px)}
      .lw-bot-chart svg{display:block;width:100%;height:auto}
      .lw-bot-chart-axis{display:flex;justify-content:space-between;color:var(--dsw-alias-label-tertiary,GrayText);font-size:var(--lw-ui-xs)}
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
      .lw-goal-ring-wrap{display:inline-flex;align-items:center;gap:10px}
      .lw-goal-ring{width:34px;height:34px;flex:none;transform:rotate(-90deg)}
      .lw-goal-ring-bg{fill:none;stroke:var(--dsw-alias-border-l2,rgba(128,128,128,.2));stroke-width:3.2}
      .lw-goal-ring-fg{fill:none;stroke:var(--dsw-alias-state-success-primary,#16a34a);stroke-width:3.2;stroke-linecap:round;transition:stroke-dashoffset .25s ease}

      .lw-fbot-detail{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));border-radius:16px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.03));padding:14px 16px;display:grid;gap:12px;min-width:0}
      .lw-fbot-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .lw-fbot-detail-figure{margin:0;border-radius:12px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05))}
      .lw-fbot-detail-media{width:100%;min-width:0;display:grid;place-items:center}
      .lw-fbot-detail-media[data-svg="true"]{background:#f8fafc}
      .lw-fbot-detail-media img{display:block;width:100%;max-height:min(620px,72vh);object-fit:contain}
      .lw-fbot-detail-media[data-svg="true"] img{padding:10px;box-sizing:border-box}
      .lw-fbot-detail-caption{padding:8px 12px;font-size:var(--lw-ui-xs);line-height:1.45;color:var(--dsw-alias-label-secondary);border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04))}
      .lw-fbot-card{min-width:0;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));border-radius:14px;padding:14px;background:var(--dsw-alias-bg-base,Canvas);display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:12px;cursor:pointer;text-align:start;transition:border-color .14s ease,background-color .14s ease,box-shadow .14s ease}
      .lw-fbot-card:hover{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border-color:var(--dsw-alias-border-l4);box-shadow:0 3px 12px rgba(0,0,0,.04)}
      .lw-fbot-card[data-active="true"]{background:var(--dsw-alias-bg-layer-1,rgba(38,49,72,.05));border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.38));box-shadow:0 0 0 1px var(--dsw-alias-border-l3,rgba(128,128,128,.22))}
      .lw-fbot-card[data-active="true"] .lw-fbot-card-icon{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.09));color:var(--dsw-alias-label-primary)}
      .lw-fbot-card-icon{width:30px;height:30px;border-radius:9px;flex:none;display:grid;place-items:center;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));color:var(--dsw-alias-label-secondary);margin-top:1px}
      .lw-fbot-card-icon .lw-icon{width:15px;height:15px}
      .lw-fbot-card-body{min-width:0;display:grid;gap:5px}
      .lw-fbot-card-title{padding:0;border:0;background:transparent;text-align:start;cursor:pointer;overflow-wrap:anywhere}
      .lw-fbot-card-title:hover{text-decoration:underline;text-underline-offset:3px}
      .lw-fbot-card[data-illustrated="true"] .lw-muse-row-sub{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden}
      .lw-fbot-card>.lw-fbot-detail-figure,.lw-fbot-card>.lw-push-source{grid-column:1/-1}
      .lw-fbot-card .lw-fbot-detail-media img{max-height:min(480px,62vh)}
      .lw-push-source{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px 14px;padding-top:9px;border-top:.5px solid var(--dsw-alias-border-l2);font-size:var(--lw-ui-sm);line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
      .lw-push-source>a{margin-inline-start:auto}

      .lw-bot-turns{display:grid;gap:10px;min-width:0}
      .lw-bot-msg{padding:11px 14px;border-radius:14px;font-size:var(--lw-ui-body);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-bot-msg[data-role="user"]{justify-self:end;max-width:min(86%,640px);background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.07));color:var(--dsw-alias-label-primary)}
      .lw-bot-msg[data-role="assistant"]{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
      .lw-bot-msg-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-tertiary);margin-bottom:4px}
      .lw-rewind-action{display:inline-grid;place-items:center;flex:none;inline-size:26px;block-size:26px;padding:0;border:0;border-radius:6px;color:var(--dsw-alias-label-secondary);background:transparent;cursor:pointer}
      .lw-rewind-action:hover,.lw-rewind-action:focus-visible{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,currentColor 10%,transparent)}
      .lw-rewind-action:disabled{opacity:.45;cursor:default}
      .lw-rewind-action .lw-icon{inline-size:16px;block-size:16px}
      .lw-bot-msg-actions{display:flex;align-items:center;gap:4px}

      .lw-fbot-composer-wrap{flex:none;padding:6px clamp(16px,3.5vw,40px) 16px;border-top:0;background:transparent}
      .lw-fbot-composer{display:flex;align-items:flex-end;gap:6px}
      .lw-fbot-composer,html[data-lw-room="global"] [data-composer-card]{box-sizing:border-box;position:relative;width:100%;max-width:740px;margin:0 auto;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));border-radius:26px;corner-shape:round;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,Canvas));box-shadow:var(--dsw-elevation-card,0 2px 12px rgba(0,0,0,.05));transition:border-color .15s ease,box-shadow .15s ease}
      .lw-fbot-composer:focus-within,html[data-lw-room="global"] [data-composer-card]:focus-within{border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.4));box-shadow:var(--dsw-elevation-panel,0 4px 16px rgba(0,0,0,.08))}
      .lw-fbot-composer textarea{flex:1;min-width:0;border:0;background:transparent;padding:5px 4px;min-height:32px;max-height:120px;resize:none;font:inherit;font-size:var(--lw-ui-body);line-height:22px;color:var(--dsw-alias-label-primary);align-self:center}
      .lw-fbot-composer textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
      .lw-fbot-composer textarea:focus{outline:none}
      .lw-fbot-composer{position:relative}
      .lw-composer-menu{position:absolute;z-index:5;inset:auto 5px calc(100% + 6px);max-height:min(42vh,280px);overflow:auto;padding:5px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:12px;background:var(--dsw-alias-bg-base,Canvas);box-shadow:0 8px 24px #0002}
      .lw-composer-menu-label{padding:4px 8px;color:var(--dsw-alias-label-secondary,GrayText);font-size:12px}
      .lw-composer-menu button{display:flex;width:100%;min-width:0;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;text-align:start;border:0;border-radius:6px;color:inherit;background:transparent;cursor:pointer}
      .lw-composer-menu button[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}
      .lw-composer-menu button small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-speaker-reply{margin:8px auto;padding:10px 14px;max-width:740px;border-inline-start:2px solid var(--dsw-alias-border-l2,#8885);white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-speaker-reply strong{display:block;margin-bottom:4px;font-size:var(--lw-ui-xs)}
      .lw-project-handoffs{position:fixed;z-index:12;inset:auto 14px 18px auto;width:min(420px,calc(100vw - 28px));max-height:min(42vh,360px);overflow:auto;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:12px;background:var(--dsw-alias-bg-base,Canvas);box-shadow:0 8px 24px #0002}
      .lw-project-handoffs p{max-height:8em;overflow:auto}
      .lw-fbot-plus-btn,.lw-fbot-send-btn{width:32px;height:32px;flex:none;border:0;border-radius:50%;corner-shape:round;display:inline-grid;place-items:center;cursor:pointer;transition:background-color .14s ease,color .14s ease,opacity .14s ease,transform .12s ease}
      .lw-composer-attach{position:relative;display:inline-flex;flex:none}
      .lw-fbot-plus-btn{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary)}
      .lw-fbot-plus-btn:hover:not(:disabled),.lw-fbot-plus-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,.24))}
      .lw-fbot-plus-btn:disabled{opacity:.4;cursor:default}
      .lw-fbot-plus-btn .lw-icon{width:17px;height:17px}
      .lw-fbot-send-btn{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff)}
      .lw-fbot-send-btn:hover:not(:disabled){opacity:.86;transform:scale(1.03)}
      .lw-fbot-send-btn:disabled{opacity:.26;cursor:not-allowed}
      .lw-fbot-send-btn .lw-icon{width:16px;height:16px}
      .lw-fbot-plus-btn:focus-visible,.lw-fbot-send-btn:focus-visible,.lw-empty-chip:focus-visible,.lw-fbot-rename-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}
      .lw-fbot-plus-menu{position:absolute;inset-inline-start:0;bottom:calc(100% + 8px);z-index:30;min-width:154px;padding:6px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.24));border-radius:14px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,Canvas)));box-shadow:var(--dsw-elevation-panel,0 12px 30px rgba(0,0,0,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,none);display:grid;gap:2px}
      .lw-fbot-plus-menu button{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--lw-ui-sm);font-weight:500;text-align:start;cursor:pointer}
      .lw-fbot-plus-menu button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .lw-fbot-plus-menu button .lw-icon{width:15px;height:15px;color:var(--dsw-alias-label-secondary)}

      [class*="centerCol"][data-lw-split="true"]{flex-direction:row!important}
      [class*="centerCol"][data-lw-split="true"]>[class*="mainPanel"]{flex:1 1 0%;min-width:340px}
      .lw-split-host{flex:1 1 0%;min-width:360px;min-height:0;height:100%;display:flex;border-left:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));background:var(--dsw-alias-bg-base,Canvas);overflow:hidden}
      .lw-split-grid{flex:1;min-width:0;min-height:0;height:100%;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(340px,1fr);overflow-x:auto}
      .lw-split-grid>.lw-page+.lw-page{border-left:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22))}

      @container lwpage (max-width:760px){
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
      .lw-receipts{display:grid;gap:6px;max-width:760px;width:calc(100% - 32px);margin:0 auto 8px;max-height:32vh;overflow:auto;font-size:var(--lw-ui-sm,13px)}
      @media(max-width:680px){
        .lw-fbot-scroll{padding:16px 12px 20px}
        .lw-fbot-composer-wrap{padding:8px 12px 12px}
        html[data-lw-room="global"] [data-conversation-content]{--dsh-composer-side-clearance:12px}
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
      if (!resp.ok) throw Error(result.error || LW('操作失败，请重试。'))
      return result
    }
    const project = (workspaceId, action, args = {}, signal) => api('workspace-page', { workspaceId, action, args }, signal)

    async function fileUploadData(file) {
      if (!file?.size || file.size > 25 * 1024 * 1024) throw Error(LW('请选择 1 字节至 25 MiB 的文件。'))
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = () => reject(Error(LW('无法读取本地文件。')))
        reader.readAsDataURL(file)
      })
    }

    const projectCache = new Map()
    function useProject(workspaceId, action = 'view', featureId = '', poll = 0) {
      const cacheKey = workspaceId + ':' + action + ':' + featureId
      const [state, setState] = React.useState(() => projectCache.has(cacheKey) ? { workspaceId, value: projectCache.get(cacheKey) } : {})
      React.useEffect(() => {
        if (action === 'bot_canvas' && !featureId) return
        let controller, timer = null, inFlight = false
        if (projectCache.has(cacheKey)) setState({ workspaceId, value: projectCache.get(cacheKey) })
        const refresh = () => {
          clearTimeout(timer); timer = null
          controller?.abort()
          controller = new AbortController()
          const signal = controller.signal
          inFlight = true
          project(workspaceId, action, featureId ? { featureId } : {}, signal).then(value => {
            if (!signal.aborted) {
              projectCache.set(cacheKey, value)
              setState({ workspaceId, value })
            }
          }).catch(error => {
            if (signal.aborted) return
            const cached = projectCache.get(cacheKey)
            setState(prev => ({ workspaceId, ...(cached ? { value: cached } : (prev?.value ? { value: prev.value } : {})), error: error.message }))
          }).finally(() => {
            if (controller?.signal === signal) inFlight = false
          })
        }
        const scheduleRefresh = () => {
          clearTimeout(timer)
          timer = setTimeout(refresh, 24)
        }
        refresh()
        const interval = poll || (action === 'files/list' ? 5000 : 0)
        const refreshTimer = interval ? setInterval(() => { if (!document.hidden && !inFlight) scheduleRefresh() }, interval) : null
        window.addEventListener(updated, scheduleRefresh)
        window.addEventListener('focus', scheduleRefresh)
        return () => { clearTimeout(timer); clearInterval(refreshTimer); controller?.abort(); window.removeEventListener(updated, scheduleRefresh); window.removeEventListener('focus', scheduleRefresh) }
      }, [workspaceId, action, featureId, poll, cacheKey])
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
    const rruleText = rule => {
      const raw = String(rule || '')
      if (!raw) return ''
      const body = raw.includes('RRULE:') ? raw.slice(raw.lastIndexOf('RRULE:') + 6) : raw
      const parts = {}
      for (const p of body.split(';')) { const i = p.indexOf('='); if (i > 0) parts[p.slice(0, i)] = p.slice(i + 1) }
      const n = Number(parts.INTERVAL) || 1
      const unit = { MINUTELY: LW('分钟'), HOURLY: LW('小时'), DAILY: LW('天'), WEEKLY: LW('周'), MONTHLY: LW('个月') }[parts.FREQ]
      if (!unit) return body || raw
      const weekday = { MO: LW('一'), TU: LW('二'), WE: LW('三'), TH: LW('四'), FR: LW('五'), SA: LW('六'), SU: LW('日') }
      const byDay = parts.BYDAY ? parts.BYDAY.split(',').map(d => LW('周') + (weekday[d.trim()] || d.trim())).join('、') : ''
      if (parts.FREQ === 'WEEKLY' && byDay) return (n === 1 ? LW('每周') : `每 ${n} 周`) + byDay
      if (parts.FREQ === 'DAILY' && n === 1) return LW('每天')
      return `每 ${n} ${unit}`
    }
    const scheduleStatusText = { active: LW('进行中'), paused: LW('已暂停'), ended: LW('已结束') }
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
      if (!file) throw Error(LW('未选择图片文件。'))
      if (file.size > 10 * 1024 * 1024) throw Error(LW('图片文件过大，请选择 10 MiB 以内的图片。'))
      if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type || '')) throw Error(LW('仅支持 PNG、JPEG、WEBP 或 GIF 格式图片。'))
      const url = URL.createObjectURL(file)
      try {
        const img = await new Promise((resolve, reject) => {
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = () => reject(Error(LW('无法解析所选图片文件。')))
          el.src = url
        })
        const w = img.naturalWidth || img.width
        const hgt = img.naturalHeight || img.height
        if (!w || !hgt) throw Error(LW('图片尺寸无效。'))
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

    function Dialog({ title, close, wide, side, id, className = '', header, children }) {
      const ref = React.useRef(null)
      React.useLayoutEffect(() => {
        const node = ref.current
        node.showModal()
        return () => node.close()
      }, [])
      return h('dialog', {
        className: ['lw-dialog', side ? 'lw-side-dialog' : wide ? 'lw-dialog-wide' : '', className].filter(Boolean).join(' '),
        id,
        ref,
        'aria-label': title,
        onCancel: event => { event.preventDefault(); close() },
        onClick: event => { if (isBackdropClick(event, ref.current)) close() },
      },
        h('div', { className: side ? 'lw-dialog-head lw-side-dialog-chrome' : 'lw-dialog-head' },
          header || h('h2', null, title),
          h('button', {
            type: 'button',
            className: 'lw-dialog-close',
            'aria-label': LW('关闭') + (title ? ' ' + title : ''),
            title: LW('关闭'),
            onClick: close,
          }, h(Icon, { name: 'close' }))),
        side ? h('div', { className: 'lw-side-dialog-content' }, children) : children)
    }

    // DSH-style dropdown: pill trigger + floating menu with a check on the selected item.
    // Replaces every native <select> so the open list is always themed, never the OS list.
    function Select({ value, options = [], onChange, disabled = false, ariaLabel, placeholder = '', className = '', inline = false, innerRef }) {
      const [open, setOpen] = React.useState(false)
      const [active, setActive] = React.useState(-1)
      const triggerRef = React.useRef(null)
      const listRef = React.useRef(null)
      const listId = React.useId()
      const selectedIndex = options.findIndex(item => String(item.value) === String(value ?? ''))
      const selected = selectedIndex >= 0 ? options[selectedIndex] : null
      const enabled = index => index >= 0 && index < options.length && !options[index].disabled
      const step = (from, dir) => {
        for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i
        return from
      }
      React.useLayoutEffect(() => { if (innerRef) innerRef.current = triggerRef.current })
      React.useLayoutEffect(() => {
        if (!open) return undefined
        const place = () => {
          const trigger = triggerRef.current, menu = listRef.current
          if (!trigger || !menu) return
          const box = trigger.getBoundingClientRect()
          const below = window.innerHeight - box.bottom - 14, above = box.top - 14
          menu.style.left = '0px'; menu.style.top = '0px'
          menu.style.minWidth = Math.max(box.width, 168) + 'px'
          menu.style.maxHeight = Math.min(360, Math.max(160, Math.max(below, above))) + 'px'
          // A transformed ancestor re-bases position:fixed, so measure the real origin first.
          const origin = menu.getBoundingClientRect()
          const height = menu.offsetHeight, width = menu.offsetWidth
          let top = height > below && above > below ? box.top - height - 6 : box.bottom + 6
          top = Math.max(8, Math.min(top, window.innerHeight - height - 8))
          const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8))
          menu.style.left = (left - origin.left) + 'px'
          menu.style.top = (top - origin.top) + 'px'
        }
        place()
        const outside = event => {
          if (listRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', outside, true)
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          document.removeEventListener('pointerdown', outside, true)
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, options.length])
      React.useEffect(() => {
        if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
      }, [open, active])
      const show = () => { if (disabled) return; setActive(enabled(selectedIndex) ? selectedIndex : step(-1, 1)); setOpen(true) }
      const choose = index => {
        if (!enabled(index)) return
        setOpen(false)
        triggerRef.current?.focus()
        if (index !== selectedIndex) onChange?.(options[index].value)
      }
      const onKeyDown = event => {
        const key = event.key
        if (!open) {
          if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') { event.preventDefault(); show() }
          return
        }
        if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
        else if (key === 'Tab') setOpen(false)
        else if (key === 'ArrowDown') { event.preventDefault(); setActive(current => step(current, 1)) }
        else if (key === 'ArrowUp') { event.preventDefault(); setActive(current => step(current, -1)) }
        else if (key === 'Home') { event.preventDefault(); setActive(step(-1, 1)) }
        else if (key === 'End') { event.preventDefault(); setActive(step(options.length, -1)) }
        else if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(active) }
      }
      const host = open ? (triggerRef.current?.closest('dialog[open],[role="dialog"],[data-shortcut-modal]') || document.body) : null
      return h(React.Fragment, null,
        h('button', {
          ref: triggerRef, type: 'button', role: 'combobox', className: ['lw-sel-trigger', className].filter(Boolean).join(' '),
          'data-inline': inline ? 'true' : undefined, 'aria-label': ariaLabel, 'aria-haspopup': 'listbox',
          'aria-expanded': open, 'aria-controls': open ? listId : undefined,
          'aria-activedescendant': open && active >= 0 ? listId + '-' + active : undefined,
          disabled, onClick: () => (open ? setOpen(false) : show()), onKeyDown,
        },
          h('span', { className: 'lw-sel-text', 'data-placeholder': selected ? undefined : 'true' }, selected ? selected.label : placeholder),
          h(Icon, { name: 'down' })),
        host && ReactDOM.createPortal(
          h('div', { ref: listRef, id: listId, className: 'lw-sel-menu', role: 'listbox' },
            options.map((item, index) => h('div', {
              key: String(item.value), id: listId + '-' + index, role: 'option', className: 'lw-sel-option', 'data-value': String(item.value),
              'aria-selected': index === selectedIndex, 'aria-disabled': item.disabled ? 'true' : undefined,
              'data-active': index === active ? 'true' : undefined,
              onPointerMove: () => { if (enabled(index) && active !== index) setActive(index) },
              onClick: () => choose(index),
            }, h('span', null, item.label), index === selectedIndex && h(Icon, { name: 'check' })))),
          host))
    }

    const rewindLabel = role => role === 'user' ? LW('撤回提问') : LW('撤回答复')

    function RewindButton({ role, onClick, disabled }) {
      const label = rewindLabel(role)
      return h('button', {
        type: 'button', className: 'lw-rewind-action', title: label, 'aria-label': label,
        disabled, onClick,
      }, h(Icon, { name: 'rewind' }))
    }

    function RewindDialog({ target, close }) {
      const [pending, setPending] = React.useState(false)
      const [error, setError] = React.useState('')
      const [finished, setFinished] = React.useState(false)
      const [unplacedDraft, setUnplacedDraft] = React.useState('')
      const dismiss = () => { if (!pending) close() }
      async function confirm() {
        setPending(true)
        setError('')
        try {
          const { sessionId, seq, role, tail, restore } = target
          const result = await api('conversation-rewind', { sessionId, seq, role, tail })
          setFinished(true)
          const warnings = []
          try {
            if (result.draft) await restore(result.draft)
          } catch {
            setUnplacedDraft(result.draft)
            warnings.push(LW('对话已撤回。请复制原文到输入框。'))
          }
          if (!result.saved) warnings.push(LW('撤回已生效，暂无法确认已写入本机历史。'))
          if (warnings.length) setError(warnings.join(' '))
          else close()
        } catch (err) {
          setError(err.message)
        } finally {
          setPending(false)
        }
      }
      return h(Dialog, { title: rewindLabel(target.role), close: dismiss }, h('div', { className: 'lw-form' },
        h('p', null, target.role === 'user'
          ? LW('从这条提问开始撤回对话。原提问的文字会带回输入框。')
          : LW('撤回这条答复及后续对话，保留之前的提问。')),
        h('p', { className: 'lw-hint' }, LW('撤回的范围是当前对话及后续模型上下文。')),
        target.hasAttachments && h('p', { className: 'lw-hint' }, LW('再次发送时可重新添加附件。')),
        error && h('p', { role: 'alert' }, error),
        unplacedDraft && h('textarea', { value: unplacedDraft, readOnly: true, 'aria-label': LW('原提问') }),
        h('div', { className: 'lw-actions lw-dialog-actions' },
          Btn({ variant: 'ghost', onClick: dismiss, disabled: pending }, finished ? LW('关闭') : LW('取消')),
          !finished && Btn({ variant: 'primary', onClick: confirm, disabled: pending }, pending ? LW('正在撤回…') : LW('确认撤回')))))
    }

    // First-run setup uses the same supplier directory and credential store as Models & API.
    function ApiOnboarding({ complete, controller, useModels, operations, schema, t, automatic, explicit = false }) {
      const state = useModels(snapshot => snapshot)
      const [provider, setProvider] = React.useState('')
      const [apiKey, setApiKey] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const progress = React.useRef({ profile: false, credential: false })
      const providerInput = React.useRef(null)
      const hasModel = state.rows.some(row => row.entry.active && (row.entry.provider === 'deepseek-account'
        ? row.accountAvailable === true : row.apiKeyEnv === undefined || row.credential?.configured === true))
      React.useEffect(() => {
        if ((automatic || explicit) && state.status === 'idle') void controller.load()
      }, [automatic, explicit, controller, state.status])
      React.useEffect(() => {
        if ((!automatic && !explicit) || (!explicit && hasModel && !progress.current.profile)) complete()
      }, [automatic, explicit, hasModel, complete])
      React.useEffect(() => {
        if (state.status === 'ready') providerInput.current?.focus()
      }, [state.status])
      if ((!automatic && !explicit) || (!explicit && hasModel && !progress.current.profile)
        || state.status === 'idle' || state.status === 'loading' && state.rows.length === 0) return null

      const suppliers = state.rows.filter(row => row.entry.provider !== 'deepseek-account'
        && state.namespaces.has(row.entry.settingsNs))
      const selected = suppliers.find(row => row.entry.provider === provider)
      const namespace = selected && state.namespaces.get(selected.entry.settingsNs)
      const close = () => { if (!busy) complete() }
      const save = async event => {
        event.preventDefault()
        if (busy || !selected || !state.writable) return
        const key = apiKey.trim()
        if (!key) { setError(t('keyRequired')); return }
        if (!/^[\x21-\x7E]+$/.test(key) || /^[A-Z][A-Z0-9_]*=[^=]/.test(key) || /^(['"`]).*\1$/.test(key)) {
          setError(t('keyIllegalCharacters'))
          return
        }
        setBusy(true)
        setError('')
        try {
          const keyRef = selected.apiKeyEnv || provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
          if (!progress.current.profile) {
            if (!selected.apiKeyEnv) {
              const result = await operations.writeSettings(selected.entry.settingsNs,
                [{ op: 'set', path: [...selected.entry.settingsPath, 'apiKeyEnv'], value: keyRef }], namespace.revision)
              if (result.kind !== 'written') throw Error(result.kind === 'conflict' ? t('conflict') : result.message)
            }
            progress.current.profile = true
          }
          if (!progress.current.credential) {
            const failure = await operations.storeCredential(keyRef, key)
            if (failure !== undefined) throw Error(failure)
            progress.current.credential = true
          }
          await controller.load()
          const refreshed = controller.store.getSnapshot()
          const profile = schema.getPath(refreshed.namespaces.get(selected.entry.settingsNs)?.value, selected.entry.settingsPath)
          let model = profile?.models?.[0]?.id
          if (!model) {
            const catalog = await operations.discoverModels(selected.entry.settingsNs, { provider })
            if (catalog.kind !== 'found') throw Error(catalog.message)
            model = catalog.models[0]?.id
          }
          if (!model) throw Error(t('customNeedsModels'))
          const defaults = refreshed.namespaces.get('agent-default-model')
          const result = await operations.writeSettings('agent-default-model', [
            { op: 'set', path: ['provider'], value: provider }, { op: 'set', path: ['model'], value: model },
          ], defaults?.revision)
          if (result.kind !== 'written') throw Error(result.kind === 'conflict' ? t('conflict') : result.message)
          setApiKey('')
          complete()
        } catch (failure) {
          setError(failure.message)
        } finally {
          setBusy(false)
        }
      }
      return h(Dialog, { title: t('onboardingTitle'), close },
        state.status === 'error'
          ? h(React.Fragment, null,
            h('p', { role: 'alert' }, t('loadFailed')),
            Btn({ onClick: () => { void controller.load() } }, t('retry')),
            Btn({ onClick: close }, t('onboardingLater')))
          : h('form', { className: 'lw-form', onSubmit: save },
            h('label', null, t('onboardingProvider'), h(Select, { value: provider, innerRef: providerInput,
              ariaLabel: t('onboardingProvider'), placeholder: t('onboardingChooseProvider'),
              disabled: busy || progress.current.profile || !state.writable,
              onChange: next => { setProvider(next); setApiKey(''); setError('') },
              options: suppliers.map(row => {
                const profile = schema.getPath(state.namespaces.get(row.entry.settingsNs).value, row.entry.settingsPath)
                return { value: row.entry.provider, label: profile?.displayName || row.entry.displayName }
              }) })),
            h('label', null, 'API Key', h('input', { type: 'password', value: apiKey, required: true,
              autoComplete: 'new-password', disabled: busy || progress.current.credential || !selected || !state.writable,
              placeholder: t('keyPlaceholder'), onChange: event => setApiKey(event.target.value) })),
            error && h('p', { role: 'alert' }, error),
            !state.writable && h('p', { role: 'alert' }, t('readOnly')),
            h('div', { className: 'lw-actions lw-dialog-actions' },
              Btn({ disabled: busy, onClick: close }, t('onboardingLater')),
              Btn({ type: 'submit', variant: 'primary', disabled: busy || !state.writable || !selected || !apiKey.trim() },
                t(busy ? 'onboardingSaving' : 'onboardingSave')))))
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
        const key=entry.time==null?LW('日期未记录'):date.format(entry.time)
        if(!groups.has(key))groups.set(key,[])
        groups.get(key).push(entry)
      }
      const line=(key,icon,title,sub,stamp)=>h('div',{key,className:'lw-hist-row'},
        h('span',{className:'lw-hist-icon','aria-hidden':true},h(Icon,{name:icon})),
        h('div',null,h('div',{className:'lw-hist-title'},title),sub&&h('div',{className:'lw-hist-muted'},sub),stamp&&h('time',{className:'lw-hist-muted'},stamp)))
      const group=(id,title,children)=>h('details',{key:id,open:true,className:'lw-hist-group'},
        h('summary',null,title,h(Icon,{name:'down'})),children)
      return h('section',{className:'lw-assistant-ledger',role:'tabpanel','aria-label':audit?LW('审核'):LW('活动')},
        !audit&&group('scheduled',data.schedules.length+LW('项预定任务'),h(React.Fragment,null,
          data.schedules.map(s=>{
            const at=new Date(s.scheduledAt), when=Number.isFinite(+at)?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(at):''
            const interval=s.interval&&s.interval%60===0?LW('每')+(s.interval/60)+LW('分钟'):''
            return line(s.id,'calendar',s.title,interval||when,null)
          }),h('button',{type:'button',className:'lw-hist-all',onClick:openSchedules},LW('查看所有预定任务')))),
        !entries.length&&h('div',{className:'lw-hist-empty'},h(Icon,{name:audit?'shield':'list'}),
          audit&&h('div',null,LW('审核')),h('p',null,audit?LW('暂无批准记录'):LW('暂无活动记录'))),
        [...groups].map(([day,rows])=>group(day,day,rows.map(r=>line(r.id,audit?'shield':'activity',r.title,
          [r.detail,r.scope,r.status].filter(Boolean).join('，'),r.time==null?'':time.format(r.time))))))
    }
    const MEM_CATEGORY_LABELS = {
      preference: LW('偏好'), research: LW('研究'), decision: LW('决策'), note: LW('备忘'),
      task_result: LW('任务结果'), confirmed_workflow: LW('实验确认'),
    }
    const MEM_SOURCE_LABELS = {
      manual: LW('手动'), conversation: LW('对话提取'), task_result: LW('任务'), confirmed_workflow: LW('实验'), profile: LW('人设'),
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
          if (searchSeq.current === seq) setSearchState({ active: true, loading: false, items: null, error: err?.message || LW('检索失败，请重试。') })
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
            h(Select, { inline: true, value: memCat, disabled: busy, ariaLabel: LW('记忆分类'), onChange: setMemCat,
              options: Object.entries(addCategories).map(([k, lbl]) => ({ value: k, label: lbl })) }),
            Btn({ variant: 'primary', size: 'sm', type: 'submit', disabled: busy || !memText.trim() }, LW('添加记忆')))),
        onSearch && h('div', { className: 'lw-ap-mem-search lw-form' },
          h('input', { type: 'search', 'aria-label': LW('搜索记忆'), placeholder: LW('检索记忆关键词（支持中文/英文）…'),
            value: query, onChange: e => setQuery(e.target.value) }),
          query.trim() && Btn({ variant: 'ghost', size: 'xs', onClick: () => setQuery('') }, LW('清空'))),
        h('div', { className: 'lw-ap-mem-list', 'aria-label': listLabel },
          searchState.loading && !displayed.length
            ? h('p', { className: 'lw-hint', style: { textAlign: 'center', padding: '18px 0' } }, LW('正在检索…'))
            : !displayed.length
              ? h('p', { className: 'lw-hint', style: { textAlign: 'center', padding: '18px 0' } },
                searchState.active ? LW('没有匹配该关键词的记忆。') : emptyText)
              : displayed.map(m => h('div', { key: m.id, className: 'lw-ap-mem-item', 'data-pinned': m.pinned ? 'true' : 'false' },
                h('div', { className: 'lw-ap-mem-head' },
                  h('div', { className: 'lw-actions' },
                    m.pinned && h(Tag, { tone: 'success' }, LW('核心置顶')),
                    h(Tag, { tone: 'neutral' }, MEM_CATEGORY_LABELS[m.category] || m.category || LW('备忘')),
                    m.source && m.source !== 'manual' && h(Tag, { tone: 'outline' }, MEM_SOURCE_LABELS[m.source] || m.source),
                    h('span', { className: 'lw-hint lw-mono' }, fmtDateTime(m.updatedAt || m.created))),
                  h('div', { className: 'lw-actions' },
                    onPin && Btn({ variant: m.pinned ? 'secondary' : 'ghost', size: 'xs', disabled: busy,
                      'aria-pressed': Boolean(m.pinned), onClick: () => onPin(m.id, !m.pinned) }, m.pinned ? LW('已置顶') : LW('置顶')),
                    editingMemId !== m.id && Btn({ variant: 'ghost', size: 'xs', disabled: busy,
                      onClick: () => { setEditingMemId(m.id); setEditingMemText(m.content) } }, LW('编辑')),
                    Btn({ variant: 'danger', size: 'xs', disabled: busy,
                      onClick: () => onDelete(m.id) }, LW('删除')))),
                editingMemId === m.id ? h('form', { className: 'lw-form', onSubmit: async e => {
                  e.preventDefault()
                  if (!editingMemText.trim()) return
                  if (await onUpdate(m.id, editingMemText.trim())) setEditingMemId(null)
                } },
                  h('textarea', { rows: 2, value: editingMemText, disabled: busy, onChange: e => setEditingMemText(e.target.value) }),
                  h('div', { className: 'lw-actions' },
                    Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy || !editingMemText.trim() }, LW('保存')),
                    Btn({ variant: 'ghost', size: 'xs', disabled: busy, onClick: () => setEditingMemId(null) }, LW('取消'))))
                  : h('div', { style: { fontSize: 'var(--lw-ui-sm)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, m.content)))))
    }

    function DeleteProjectDialog({ row, removeProject, onCancel, onDeleted }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const dismiss = () => { if (!busy) onCancel() }
      async function confirm() {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await removeProject(row)
          onDeleted()
        } catch (failure) {
          setError(failure.message)
          setBusy(false)
        }
      }
      return h(Dialog, { title: LW('删除项目'), close: dismiss },
        h('div', { className: 'lw-form' },
          h('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } },
            `确定删除「${row.name}」及其对话和生成文件吗？对话日志将在 Weave 停止时永久清理。导入文件、关联的本机来源和代码仓库会保留。请先停止运行中的实验。`),
          error && h('p', { role: 'alert', className: 'lw-error' }, error),
          h('div', { className: 'lw-actions lw-dialog-actions' },
            Btn({ variant: 'ghost', onClick: dismiss, disabled: busy }, LW('取消')),
            Btn({ variant: 'danger', disabled: busy, onClick: confirm }, busy ? LW('删除中…') : LW('确认删除')))))
    }

    function ProjectSettingsDialog({ row, close, refresh, pickDirectory, removeProject }) {
      const [section, setSection] = React.useState('info')
      const [settings, setSettings] = React.useState(null)
      const [info, setInfo] = React.useState(null)
      const [folder, setFolder] = React.useState(null)
      const [confirmingDelete, setConfirmingDelete] = React.useState(false)
      const folderInput = React.useRef(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const { workspaceId } = row
      const readSettings = React.useCallback(signal => project(workspaceId, 'settings/view', {}, signal), [workspaceId])
      React.useEffect(() => {
        const controller = new AbortController()
        readSettings(controller.signal).then(value => {
          if (!controller.signal.aborted) {
            setSettings(value)
            setInfo({ name: value.name, description: value.description, topic: value.topic })
          }
        }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
        return () => controller.abort()
      }, [readSettings])

      async function run(action, success) {
        if (busy) return
        setBusy(true); setError(''); setNotice('')
        try {
          await action()
          if (success) setNotice(success)
        } catch (err) { setError(err.message) }
        finally { setBusy(false) }
      }

      const edits = info && settings ? Object.fromEntries(
        Object.entries(info).filter(([key, value]) => value.trim() !== settings[key].trim()),
      ) : {}
      const infoField = (key, label, multiline, attributes) => h('label', null, label,
        h(multiline ? 'textarea' : 'input', {
          ...attributes, value: info[key], disabled: busy,
          onChange: event => setInfo(previous => ({ ...previous, [key]: event.target.value })),
        }))
      const editFolder = source => {
        setError(''); setNotice('')
        setFolder(source ? { id: source.id, name: source.name, path: source.path } : { path: '' })
        requestAnimationFrame(() => folderInput.current?.focus())
      }
      const chooseFolder = () => run(async () => {
        try {
          const path = await pickDirectory()
          if (path) setFolder(previous => ({ ...previous, path }))
        } catch { throw Error(LW('无法打开目录选择器，可以直接粘贴文件夹路径。')) }
      })
      const deleteButton = Btn({ variant: 'danger', className: 'lw-project-delete-btn', disabled: busy,
        onClick: () => setConfirmingDelete(true) }, LW('删除项目'))
      const settingsDialog = h(Dialog, { title: LW('项目设置'), close: () => { if (!busy && !confirmingDelete) close() } },
        h('div', { className: 'lw-project-settings' },
          h('nav', { className: 'lw-segmented', 'aria-label': LW('项目设置栏目') },
            [['info', LW('基本信息')], ['sources', LW('来源文件夹')]].map(([key, label]) =>
              h('button', { key, type: 'button', className: 'lw-seg-btn', 'aria-pressed': section === key,
                disabled: busy, onClick: () => { setSection(key); setError(''); setNotice('') } }, label))),
          error && h('p', { role: 'alert', className: 'lw-error' }, error),
          notice && h('p', { role: 'status', className: 'lw-notice' }, notice),
          !settings && !error && h('p', { role: 'status', className: 'lw-hint' }, LW('正在读取项目设置…')),
          section === 'info' && settings && h('form', { className: 'lw-form', onSubmit: event => {
            event.preventDefault()
            if (!info.name.trim() || !Object.keys(edits).length) return
            void run(async () => {
              const next = await project(workspaceId, 'settings/update', edits)
              setSettings(next)
              setInfo({ name: next.name, description: next.description, topic: next.topic })
              await refresh()
              window.dispatchEvent(new Event(updated))
            }, LW('已保存项目信息。'))
          } },
          infoField('name', LW('项目名称'), false, { required: true, maxLength: 80 }),
          infoField('description', LW('项目简介'), true, { rows: 4, maxLength: 2000 }),
          infoField('topic', LW('项目主题'), false, { maxLength: 2000 }),
          h('div', { className: 'lw-actions lw-dialog-actions' },
            deleteButton,
            Btn({ variant: 'primary', type: 'submit', disabled: busy || !info.name.trim() || !Object.keys(edits).length }, LW('保存')))),
          section === 'sources' && settings && h(React.Fragment, null,
            h('p', { className: 'lw-hint', style: { margin: 0 } }, LW('来源文件留在原处，供本项目的助手和 Bot 按需读取。')),
            settings.sources.length > 0 && h('ul', { className: 'lw-source-list', role: 'list', 'aria-label': LW('已关联文件夹') },
              settings.sources.map(source => h('li', { key: source.id, className: 'lw-source-row' },
                h(Icon, { name: 'folder' }),
                h('div', { className: 'lw-source-label' },
                  h('strong', null, source.name),
                  h('span', { className: 'lw-hist-muted' }, source.path),
                  !source.available && h('span', { className: 'lw-hint' }, LW('文件夹不可用'))),
                h('div', { className: 'lw-actions' },
                  Btn({ variant: 'ghost', size: 'xs', disabled: busy, 'aria-label': LW('编辑来源 ') + source.name,
                    onClick: () => editFolder(source) }, LW('编辑')),
                  Btn({ variant: 'ghost', size: 'xs', disabled: busy, 'aria-label': LW('移除来源 ') + source.name,
                    onClick: () => void run(async () => {
                      await project(workspaceId, 'sources/remove', { id: source.id })
                      setSettings(await readSettings())
                      if (folder?.id === source.id) setFolder(null)
                    }, LW('已移除来源。')) }, LW('移除')))))),
            !folder && h('div', { className: 'lw-actions lw-dialog-actions' }, deleteButton, Btn({
              variant: 'secondary', className: 'lw-add-action', disabled: busy, onClick: () => editFolder(null),
            }, h(Icon, { name: 'plus' }), LW('添加文件夹'))),
            folder && h('form', { className: 'lw-form', onSubmit: event => {
              event.preventDefault()
              if (!folder.path.trim()) return
              void run(async () => {
                await project(workspaceId, 'sources/save', folder)
                setSettings(await readSettings())
                setFolder(null)
              }, folder.id ? LW('已保存来源。') : LW('已添加来源。'))
            } },
            h('div', { className: 'lw-source-picker' },
              h('input', { ref: folderInput, 'aria-label': LW('文件夹路径'), placeholder: LW('选择文件夹或粘贴路径'),
                value: folder.path, required: true, disabled: busy,
                onChange: event => setFolder(previous => ({ ...previous, path: event.target.value })) }),
              Btn({ variant: 'secondary', disabled: busy, onClick: chooseFolder },
                h(Icon, { name: 'folder' }), LW('选择文件夹'))),
            folder.id && h('label', null, LW('显示名称'),
              h('input', { value: folder.name, maxLength: 80, disabled: busy,
                onChange: event => setFolder(previous => ({ ...previous, name: event.target.value })) })),
            h('div', { className: 'lw-actions lw-dialog-actions' },
              deleteButton,
              Btn({ variant: 'ghost', disabled: busy, onClick: () => { setFolder(null); setError('') } }, LW('取消')),
              Btn({ variant: 'primary', type: 'submit', disabled: busy || !folder.path.trim() },
                folder.id ? LW('保存来源') : LW('添加来源')))))))
      return h(React.Fragment, null, settingsDialog, confirmingDelete && h(DeleteProjectDialog, {
        row: { ...row, name: settings?.name || row.name }, removeProject,
        onCancel: () => setConfirmingDelete(false), onDeleted: close,
      }))
    }

    function AssistantProfileModal({ close, refresh, initialRow, openSettings, openSchedules, startGlobalChat }) {
      const ref = React.useRef(null)
      const fileRef = React.useRef(null)
      const contentRef = React.useRef(null)
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
      React.useLayoutEffect(() => {
        contentRef.current.scrollTop = 0
      }, [tab, subView])

      const load = React.useCallback(async () => {
        try {
          setErr('')
          const data = await api('assistant-profile')
          setProfile(data)
          setStatus('ready')
        } catch (error) {
          setStatus('error')
          setErr(error.message || LW('无法读取助手资料，请检查本地服务。'))
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
          setErr(error.message || LW('保存失败，请重试。'))
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
          await applyProfile({ avatar }, LW('头像已更新。'))
        } catch (error) {
          setErr(error.message || LW('更换头像失败。'))
        }
      }

      const startEditInfo = () => {
        if (!profile) return
        setDraft({ name: profile.name || '', tagline: profile.tagline || '', persona: profile.persona || '' })
        setEditingInfo(true); setErr(''); setNoticeText('')
      }

      const saveInfo = async e => {
        e.preventDefault()
        if (!draft.name.trim()) { setErr(LW('助手名称不能为空。')); return }
        const saved = await applyProfile({
          name: draft.name.trim(),
          tagline: draft.tagline.trim(),
          persona: draft.persona.trim(),
        }, LW('助手资料已保存。'))
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
      const avatarSrc = hasCustomAvatar ? (profile?.avatar || initialRow?.avatar) : './weave-orbit.svg'
      const displayName = profile?.name || initialRow?.name || 'Weave'

      return h('dialog', {
        ref, className: 'lw-ap-dialog lw-side-dialog', 'aria-label': LW('全局助手设置'),
        onCancel: e => { e.preventDefault(); close() },
        onClick: e => { if (isBackdropClick(e, ref.current)) close() },
      },
        h('header', { className: 'lw-ap-chrome lw-side-dialog-chrome' },
          h('div', { className: 'lw-ap-topbar' },
            subView ? h('button', { type: 'button', className: 'lw-ap-back-btn', onClick: () => { setSubView(null); setErr(''); setNoticeText('') } },
              h(Icon, { name: 'back' }), h('span', null, subView === 'soul' ? LW('核心准则') : LW('全局记忆')))
              : h('span', null),
            h('button', { type: 'button', className: 'lw-ap-icon-btn', 'aria-label': LW('关闭助手资料'), title: LW('关闭'), onClick: close },
              h(Icon, { name: 'close' }))),
          h('div', { className: 'lw-ap-header' },
            h('div', { className: 'lw-ap-avatar-box' },
              h('div', {
                className: 'lw-ap-avatar-circle',
                'data-custom': hasCustomAvatar ? 'true' : 'false',
                style: { cursor: 'pointer' },
                onClick: () => fileRef.current?.click(),
                title: LW('点击更换头像'),
              }, h('img', { src: avatarSrc, alt: displayName, draggable: false })),
              h('label', { className: 'lw-ap-avatar-edit', title: LW('更换头像'), 'aria-label': LW('更换头像') },
                h(Icon, { name: 'edit' }),
                h('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', disabled: busy, onChange: pickAvatar }))),
            h('h2', { className: 'lw-ap-name' }, displayName),
            h('div', { className: 'lw-ap-status', role: status === 'error' ? 'alert' : 'status' },
              status === 'ready' ? h(React.Fragment, null, BoltBadge({ tone: 'ok' }), h('span', null, LW('已连接')))
                : status === 'loading' ? h(React.Fragment, null, BoltBadge({ tone: 'loading' }), h('span', null, LW('正在读取助手资料…')))
                : h(React.Fragment, null, BoltBadge({ tone: 'error' }), h('span', null, LW('连接异常')),
                  Btn({ variant: 'ghost', size: 'xs', onClick: load }, LW('重试')))),
            profile?.hasCustomAvatar && h('button', {
              type: 'button', className: 'lw-ap-reset-avatar', disabled: busy,
              onClick: () => applyProfile({ avatar: '' }, LW('已恢复默认图标。')),
            }, LW('恢复默认图标'))),

          !subView && h('div', { className: 'lw-ap-tabs', role: 'tablist', 'aria-label': LW('助手资料栏目') },
            [
              ['overview', 'list', LW('活动')],
              ['security', 'shield', LW('审核')],
              ['identity', 'fingerprint', LW('人设与记忆')],
            ].map(([id, icon, label]) => h('button', {
              key: id, type: 'button', role: 'tab', className: 'lw-ap-tab',
              'aria-selected': tab === id, 'aria-label': label, title: label,
              onClick: () => { setTab(id); setEditingInfo(false); setErr(''); setNoticeText('') },
            }, h(Icon, { name: icon }))))),

        h('div', { ref: contentRef, className: 'lw-ap-content lw-side-dialog-content', role: 'region', 'aria-label': LW('助手资料内容'), tabIndex: 0 },
        !subView ? h(React.Fragment, null,
          err && h('p', { role: 'alert', className: 'lw-error', style: { margin: '0 0 10px', textAlign: 'center' } }, err),
          noticeText && h('p', { role: 'status', className: 'lw-notice', style: { margin: '0 auto 10px', display: 'flex', justifyContent: 'center' } }, noticeText),

          tab === 'identity' && profile && h(React.Fragment, null,
            h('section', { className: 'lw-ap-card', 'aria-label': LW('助手人设资料') },
              !editingInfo ? h(React.Fragment, null,
                h('div', { className: 'lw-ap-card-name' }, profile.name),
                h('div', { className: 'lw-ap-card-sub' }, profile.tagline),
                h('div', { className: 'lw-ap-card-label' }, LW('风格气质')),
                h('div', { className: 'lw-ap-card-body' }, profile.persona),
                h('button', { type: 'button', className: 'lw-ap-edit-pill', disabled: busy, onClick: startEditInfo },
                  h(Icon, { name: 'edit' }), h('span', null, LW('编辑'))))
                : h('form', { className: 'lw-form', onSubmit: saveInfo },
                  h('label', null, LW('助手名称'),
                    h('input', { required: true, autoFocus: true, maxLength: 80, value: draft.name, disabled: busy,
                      onChange: e => setDraft(prev => ({ ...prev, name: e.target.value })) })),
                  h('label', null, LW('一句话简介'),
                    h('input', { maxLength: 200, value: draft.tagline, disabled: busy, placeholder: LW('理性、严谨、好奇…'),
                      onChange: e => setDraft(prev => ({ ...prev, tagline: e.target.value })) })),
                  h('label', null, LW('风格气质'),
                    h('textarea', { rows: 4, maxLength: 2000, value: draft.persona, disabled: busy,
                      onChange: e => setDraft(prev => ({ ...prev, persona: e.target.value })) })),
                  h('div', { className: 'lw-actions', style: { justifyContent: 'flex-end' } },
                    Btn({ variant: 'ghost', size: 'sm', disabled: busy, onClick: () => setEditingInfo(false) }, LW('取消')),
                    Btn({ variant: 'primary', size: 'sm', type: 'submit', disabled: busy || !draft.name.trim() }, busy ? LW('保存中…') : LW('保存'))))),

            h('div', { className: 'lw-ap-cards-grid' },
              h('button', { type: 'button', className: 'lw-ap-grad-card lw-ap-grad-soul', onClick: openSoul },
                h('div', null,
                  h('span', { className: 'lw-ap-grad-title' }, 'SOUL'),
                  h('span', { className: 'lw-ap-grad-sub' }, LW('核心准则，请谨慎修改'))),
                h('div', { className: 'lw-ap-grad-foot' },
                  h('span', null, fmtDotDate(profile.soulUpdatedAt)),
                  CardHeartIcon())),
              h('button', { type: 'button', className: 'lw-ap-grad-card lw-ap-grad-memory', onClick: openMemory },
                h('div', null,
                  h('span', { className: 'lw-ap-grad-title' }, LW('记忆')),
                  h('span', { className: 'lw-ap-grad-sub' }, `跨会话记忆，${profile.memories?.length || 0} 条`)),
                h('div', { className: 'lw-ap-grad-foot' },
                  h('span', null, fmtDotDate(profile.memoryUpdatedAt)),
                  CardHeartIcon())))),

          tab !== 'identity' && h(AssistantLedger, {tab, openSchedules:()=>{close();openSchedules?.()}}))

        : subView === 'soul' ? h('form', { className: 'lw-form', style: { marginTop: 10 }, onSubmit: async e => {
          e.preventDefault()
          const saved = await applyProfile({ soul: soulDraft }, LW('SOUL 核心准则已保存。'))
          if (saved) setSoulDraft(saved.soul)
        } },
          h('p', { className: 'lw-hint' }, LW('SOUL 定义了全局助手的核心准则、证据要求与行为边界，会在每次全局对话中作为行为规范生效。')),
          err && h('p', { role: 'alert', className: 'lw-error' }, err),
          noticeText && h('p', { role: 'status', className: 'lw-notice' }, noticeText),
          h('label', null, LW('核心准则（SOUL）'),
            h('textarea', { rows: 9, maxLength: 8000, value: soulDraft, disabled: busy,
              onChange: e => setSoulDraft(e.target.value) })),
          h('div', { className: 'lw-actions', style: { justifyContent: 'space-between' } },
            Btn({ variant: 'ghost', size: 'sm', disabled: busy, onClick: async () => {
              const reset = await applyProfile({ action: 'reset_soul' }, LW('已恢复默认核心准则。'))
              if (reset) setSoulDraft(reset.soul)
            } }, LW('恢复默认')),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'ghost', size: 'sm', disabled: busy, onClick: () => setSubView(null) }, LW('返回')),
              Btn({ variant: 'primary', size: 'sm', type: 'submit', disabled: busy }, busy ? LW('保存中…') : LW('保存 SOUL')))))

        : h(MemorySection, {
            hint: LW('记录全局偏好、跨项目工作规范与长期备忘，仅保存在本机并作用于全局助手对话。'),
            placeholder: LW('输入要让全局助手长期记住的偏好或备忘…'),
            listLabel: LW('全局记忆列表'),
            emptyText: LW('暂无全局记忆，可在上方添加第一条。'),
            addCategories: { preference: LW('偏好'), research: LW('研究'), decision: LW('决策'), note: LW('备忘') },
            memories: profile?.memories || [],
            busy,
            error: err,
            notice: noticeText,
            onSearch: async query => (await api('assistant-profile', { action: 'memory_search', query }))?.results || [],
            onAdd: async (content, category) => Boolean(await applyProfile({ action: 'memory_add', content, category }, LW('已添加全局记忆。'))),
            onUpdate: async (id, content) => Boolean(await applyProfile({ action: 'memory_update', id, content }, LW('已更新记忆。'))),
            onPin: async (id, pinned) => Boolean(await applyProfile({ action: 'memory_pin', id, pinned }, pinned ? LW('已置顶为核心记忆。') : LW('已取消置顶。'))),
            onDelete: async id => Boolean(await applyProfile({ action: 'memory_delete', id }, LW('已删除记忆。'))),
          }))
      )
    }

    const botSymbols = ['✦','◎','△','◇','✚','☷','⚑','⌘','Σ','λ','∞','✎']
    const botParadigms = {
      goals: { label: '目标', icon: 'goals', accent: '#638fd5' },
      notes: { label: '笔记', icon: 'library', accent: '#489781' },
      mindmap: { label: '思维导图', icon: 'mindmap', accent: '#9473c1' },
      ideas: { label: '点子', icon: 'ideas', accent: '#b47f3d' },
      engineering: { label: '工程台', icon: 'activity', accent: '#558fa7' },
    }
    const paradigmAvatarRules = [
      [/缺陷|bug|故障|报错|异常|排查|调试|defect|debug|issue|error|fix/i, 'lucide:bug'],
      [/文献|论文|综述|阅读|paper|arxiv|literature|reading|survey|journal/i, 'lucide:book-open'],
      [/引用|参考文献|引文|出处|citation|reference|quote|\bbib\b/i, 'lucide:quote'],
      [/核查|审核|审查|证据|合规|验证|audit|verify|review|evidence|fact/i, 'lucide:shield-check'],
      [/数据集|数据库|语料|样本库|dataset|database|corpus|\bsql\b/i, 'lucide:database'],
      [/表格|对比表|对照|基准|评测|评估|benchmark|table|matrix|comparison|eval/i, 'lucide:table'],
      [/折线|趋势|曲线|监控|指标|metric|trend|curve|loss|accuracy/i, 'lucide:chart-line'],
      [/统计|分布|柱状|直方|stat|histogram|\bbar\b/i, 'lucide:chart-bar'],
      [/散点|回归|聚类|相关|scatter|cluster|correlation/i, 'lucide:chart-scatter'],
      [/知识图谱|引证网|关系图|拓扑|网络|graph|network|ontology/i, 'lucide:chart-network'],
      [/脉络|路线|演进|演化|谱系|lineage|roadmap|route/i, 'lucide:route'],
      [/流程|工作流|流水线|管线|步骤|workflow|pipeline|process/i, 'lucide:workflow'],
      [/实验|试跑|消融|化学|烧瓶|试剂|experiment|chemistry|flask|trial|ablation/i, 'lucide:flask-conical'],
      [/生物|细胞|显微|病理|组织|microscope|biology|cell/i, 'lucide:microscope'],
      [/基因|蛋白|序列|基因组|\bdna\b|\brna\b|gene|genome|protein/i, 'lucide:dna'],
      [/物理|量子|原子|粒子|physics|quantum|atom|particle/i, 'lucide:atom'],
      [/天文|望远镜|轨道|宇宙|astro|telescope|orbit|space/i, 'lucide:telescope'],
      [/数学|公式|定理|证明|推导|math|formula|theorem|proof|equation|sigma/i, 'lucide:sigma'],
      [/代码|编程|脚本|实现|coding|code|script|program|\bapi\b/i, 'lucide:code'],
      [/仓库|开源|github|repo|repository/i, 'lucide:github'],
      [/分支|版本|发布|\bgit\b|branch|version|release/i, 'lucide:git-branch'],
      [/终端|命令|部署|运维|terminal|\bcli\b|shell|deploy/i, 'lucide:terminal'],
      [/算力|硬件|芯片|\bgpu\b|\bcuda\b|\bcpu\b|hardware|chip/i, 'lucide:cpu'],
      [/服务器|集群|节点|server|infra|cloud/i, 'lucide:server'],
      [/检索|搜索|查重|专利|search|query|retrieval|patent/i, 'lucide:file-search'],
      [/动态|资讯|新闻|快讯|周报|日报|news|digest|feed|weekly|report/i, 'lucide:newspaper'],
      [/日程|排期|会议|截止|\bddl\b|calendar|schedule|meeting|deadline/i, 'lucide:calendar'],
      [/时间线|编年|历史|日志|timeline|history|changelog|\blog\b/i, 'lucide:history'],
      [/清单|待办|检查表|任务|checklist|todo|task/i, 'lucide:list-checks'],
      [/里程碑|阶段|目标|milestone|goal|\bokr\b|\bkpi\b/i, 'lucide:milestone'],
      [/假设|认知|推理|推演|思考|brain|hypothesis|reasoning|cognition/i, 'lucide:brain'],
      [/灵感|点子|创意|脑暴|idea|spark|brainstorm|insight/i, 'lucide:lightbulb'],
      [/笔记|备忘|摘录|notebook|note|memo|diary/i, 'lucide:notebook'],
      [/书签|收藏|资料|bookmark|collection|archive/i, 'lucide:book-marked'],
      [/文档|写作|草稿|投稿|稿件|draft|writing|manuscript|submission|\bdoc\b/i, 'lucide:file-text'],
      [/链接|网站|网址|\burl\b|link|web/i, 'lucide:link'],
      [/模块|组件|架构|系统|architecture|module|component/i, 'lucide:blocks'],
      [/插件|工具|扩展|plugin|tool|extension/i, 'lucide:puzzle'],
      [/绘图|可视化|插图|视觉|figure|plot|visual|draw|design/i, 'lucide:paintbrush'],
    ]
    const paradigmBaseFallback = {
      goals: 'lucide:milestone',
      notes: 'lucide:book-marked',
      mindmap: 'lucide:chart-network',
      ideas: 'lucide:brain',
      engineering: 'lucide:flask-conical',
    }
    function inferParadigmSymbol(name, desc, base, fieldList) {
      const corpus = [name || '', desc || '', ...(fieldList || []).map(f => f.name || '')].join(' ')
      for (const [pattern, icon] of paradigmAvatarRules) {
        if (pattern.test(corpus)) return icon
      }
      return paradigmBaseFallback[base] || 'lucide:book-marked'
    }
    let avatarCatalogCache = null
    function useAvatarCatalog(enabled) {
      const [groups, setGroups] = React.useState(() => avatarCatalogCache || [])
      React.useEffect(() => {
        if (!enabled || avatarCatalogCache) return
        let alive = true
        fetch('./labweave-bot-avatars.json').then(r => r.ok ? r.json() : []).then(data => {
          if (Array.isArray(data) && data.length) {
            avatarCatalogCache = data
            if (alive) setGroups(data)
          }
        }).catch(() => {})
        return () => { alive = false }
      }, [enabled])
      return groups
    }
    const paradigmIconFor = feat => {
      if (!feat) return 'bot'
      if (feat.extension?.symbol) return feat.extension.symbol
      if (feat.builtin && paths[feat.id]) return feat.id
      if (feat.paradigm && botParadigms[feat.paradigm]) return botParadigms[feat.paradigm].icon
      return featureIcon(feat.id)
    }
    const botDisplayIcon = feat => (feat?.symbol || paradigmIconFor(feat))
    const paradigmKeyFor = feat => {
      const base = feat?.extension?.base || feat?.paradigm
      return (base && botParadigms[base]) ? base : undefined
    }
    const paradigmAccentFor = feat => {
      const key = paradigmKeyFor(feat)
      return key ? botParadigms[key].accent : undefined
    }
    const botLayoutLabels = {
      calendar: '目标日历', checklist: '目标清单', path: '目标路径', library: '资料库', timeline: '文件动态',
      graph: '关系图', lineage: '文献脉络', branches: '发散探索', reasoning: '线性推演',
      sequence: '实验流程', matrix: '并行实验',
    }
    const extensionLayouts = {
      goals: ['checklist', 'path'], notes: ['library', 'timeline'], mindmap: ['graph', 'lineage'],
      ideas: ['branches', 'reasoning'], engineering: ['sequence', 'matrix'],
    }
    const fieldTypeLabels = { text: '文本', number: '数字', date: '日期', boolean: '是／否', url: '链接', reference: '记录引用' }
    const fieldRoles = {
      detail: ['详情', ['text', 'number', 'date', 'boolean', 'url']],
      title: ['主标题', ['text']], summary: ['摘要', ['text']], group: ['分组', ['text']],
      date: ['时间位置', ['date']], status: ['状态', ['text', 'boolean']],
      source: ['原始来源', ['url']], relation: ['关联记录', ['reference']],
    }
    const blankExtensionField = () => ({ id: requestId(), name: '', type: 'text', role: 'detail' })

    function CreateFeatureBot({ row, close, created }) {
      const [id] = React.useState(requestId)
      const [label, setLabel] = React.useState('')
      const [paradigm, select] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [extensions, setExtensions] = React.useState([])
      const [editing, setEditing] = React.useState(false)
      const [extensionName, setExtensionName] = React.useState('')
      const [description, setDescription] = React.useState('')
      const [fields, setFields] = React.useState(() => [blankExtensionField()])
      const [extensionLayout, setExtensionLayout] = React.useState('timeline')
      const [extensionSymbol, setExtensionSymbol] = React.useState('')
      const [showAvatarPicker, setShowAvatarPicker] = React.useState(false)
      const [avatarQuery, setAvatarQuery] = React.useState('')
      const avatarGroups = useAvatarCatalog(editing && showAvatarPicker)
      const extensionBase = Object.keys(extensionLayouts).find(key => extensionLayouts[key].includes(extensionLayout)) || 'notes'
      const previewExtensionSymbol = extensionSymbol || inferParadigmSymbol(extensionName, description, extensionBase, fields)
      const filteredAvatars = React.useMemo(() => {
        const q = avatarQuery.trim().toLowerCase()
        return avatarGroups
          .filter(g => g.name !== '经典')
          .flatMap(g => g.items.filter(item => !q || (g.name + ' ' + item.id + ' ' + item.label).toLowerCase().includes(q)))
      }, [avatarGroups, avatarQuery])
      React.useEffect(() => {
        const controller = new AbortController()
        project(row.workspaceId, 'project_paradigms', {}, controller.signal).then(setExtensions).catch(failure => {
          if (!controller.signal.aborted) setError(failure.message)
        })
        return () => controller.abort()
      }, [row.workspaceId])
      const selectedExtension = extensions.find(item => item.id === paradigm)
      function updateField(id, patch) {
        setFields(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
      }
      async function saveExtension() {
        setBusy(true)
        setError('')
        const base = Object.keys(extensionLayouts).find(key => extensionLayouts[key].includes(extensionLayout))
        try {
          const definition = await project(row.workspaceId, 'create_project_paradigm', {
            label: extensionName.trim(), description: description.trim(), base, layout: extensionLayout,
            ...(extensionSymbol ? { symbol: extensionSymbol } : {}),
            fields: fields.map(({ name, type, role }) => ({ name: name.trim(), type, role })),
          })
          setExtensions(items => [...items.filter(item => item.id !== definition.id), definition])
          select(definition.id)
          setEditing(false)
          setExtensionName('')
          setDescription('')
          setExtensionSymbol('')
          setShowAvatarPicker(false)
          setAvatarQuery('')
          setFields([blankExtensionField()])
        } catch (failure) {
          setError(failure.message)
        } finally {
          setBusy(false)
        }
      }
      async function submit(event) {
        event.preventDefault()
        if (busy || editing || !paradigm || !label.trim()) return
        setBusy(true)
        setError('')
        try {
          const result = await project(row.workspaceId, 'create_feature_bot', { label: label.trim(), paradigm, requestId: id })
          await created(row, result.feature)
        } catch (failure) {
          setError(failure.message)
          setBusy(false)
        }
      }
      return h(Dialog, { title: LW('创建功能 Bot'), className: 'lw-bot-create', close: () => { if (!busy) close() } },
        h('form', { className: 'lw-form', onSubmit: submit },
          h('fieldset', { className: 'lw-paradigm-set', disabled: busy },
            h('legend', null, LW('范式')),
            h('div', { className: 'lw-paradigm-options' }, Object.entries(botParadigms).map(([key, meta]) =>
              h('label', { key, className: 'lw-paradigm-option' },
                h('input', { type: 'radio', name: 'paradigm', value: key, checked: paradigm === key, onChange: () => select(key) }),
                h('span', { className: 'lw-paradigm-art', style: { '--lw-paradigm-accent': meta.accent }, 'aria-hidden': true }, h(Icon, { name: meta.icon })),
                h('span', null, LW(meta.label)))))),
          h('fieldset', { className: 'lw-paradigm-set', disabled: busy },
            h('legend', null, LW('项目扩展范式')),
            extensions.length > 0 && h('div', { className: 'lw-paradigm-options-ext' }, extensions.map(item => {
              const extAccent = botParadigms[item.base]?.accent || '#638fd5'
              const extIcon = item.symbol || botParadigms[item.base]?.icon || 'bot'
              return h('label', { key: item.id, className: 'lw-paradigm-option', title: item.description },
                h('input', { type: 'radio', name: 'paradigm', value: item.id, checked: paradigm === item.id, onChange: () => select(item.id) }),
                h('span', { className: 'lw-paradigm-art', style: { '--lw-paradigm-accent': extAccent }, 'aria-hidden': true }, h(Icon, { name: extIcon })),
                h('span', null, item.label))
            })),
            selectedExtension && h('p', { className: 'lw-hint' }, selectedExtension.description),
            !editing && Btn({ variant: 'ghost', size: 'xs', type: 'button', onClick: () => setEditing(true) }, LW('新增扩展范式')),
            editing && h('div', { className: 'lw-form' },
              h('label', null, LW('范式名称'), h('input', { value: extensionName, maxLength: 80, onChange: e => setExtensionName(e.target.value) })),
              h('label', null, LW('语义描述'), h('textarea', { rows: 2, value: description, maxLength: 2000,
                placeholder: LW('描述要展示的内容、何时记录、如何组织。例如按更新时间追踪数据集版本及授权变化。'),
                onChange: e => setDescription(e.target.value) })),
              h('label', null, LW('展示排布'), h(Select, { value: extensionLayout, ariaLabel: LW('展示排布'), onChange: setExtensionLayout,
                options: Object.entries(botLayoutLabels).map(([key, title]) => ({ value: key, label: title })) })),
              h('div', { className: 'lw-paradigm-preview-row' },
                h('span', { className: 'lw-paradigm-preview-badge', style: { '--lw-paradigm-accent': botParadigms[extensionBase]?.accent || '#638fd5' }, 'aria-hidden': true },
                  h(Icon, { name: previewExtensionSymbol })),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('strong', { style: { fontSize: 'var(--lw-ui-sm)', display: 'block' } }, LW('范式头像标识')),
                  h('span', { className: 'lw-hint', style: { fontSize: 'var(--lw-ui-xs)' } },
                    extensionSymbol ? LW('已手动选择头像') : LW('已按名称与描述自动匹配，创建 Bot 后将显示此头像'))),
                extensionSymbol && Btn({ variant: 'ghost', size: 'xs', type: 'button', onClick: () => setExtensionSymbol('') }, LW('自动匹配')),
                Btn({ variant: 'ghost', size: 'xs', type: 'button', onClick: () => setShowAvatarPicker(v => !v) }, LW(showAvatarPicker ? '收起头像' : '更换头像'))),
              showAvatarPicker && h('div', { className: 'lw-form', style: { gap: 6 } },
                h('input', {
                  type: 'search', value: avatarQuery, placeholder: LW('搜索头像，如 缺陷 / 论文 / 实验 / microscope'),
                  'aria-label': LW('搜索范式头像'), onChange: e => setAvatarQuery(e.target.value),
                }),
                h('div', { className: 'lw-paradigm-avatar-grid', role: 'group', 'aria-label': LW('选择范式头像') },
                  filteredAvatars.map(item => h('button', {
                    key: item.id, type: 'button', title: item.label, 'aria-label': LW('头像 ') + item.label,
                    'aria-pressed': previewExtensionSymbol === item.id,
                    onClick: () => setExtensionSymbol(item.id),
                  }, h(Icon, { name: item.id }))))),
              h('div', { className: 'lw-extension-fields' }, fields.map(field =>
                h('div', { key: field.id, className: 'lw-extension-field' },
                  h('label', null, LW('字段名'), h('input', { value: field.name, maxLength: 40,
                    onChange: e => updateField(field.id, { name: e.target.value }) })),
                  h('label', null, LW('展示用途'), h(Select, { value: field.role, ariaLabel: LW('展示用途'),
                    onChange: role => {
                      const types = fieldRoles[role][1]
                      updateField(field.id, { role, type: types.includes(field.type) ? field.type : types[0] })
                    },
                    options: Object.entries(fieldRoles).map(([role, [title]]) => ({
                      value: role, label: title, disabled: role !== 'detail' && fields.some(other => other.id !== field.id && other.role === role),
                    })) })),
                  h('label', null, LW('字段类型'), h(Select, { value: field.type, ariaLabel: LW('字段类型'),
                    onChange: type => updateField(field.id, { type }),
                    options: fieldRoles[field.role][1].map(type => ({ value: type, label: fieldTypeLabels[type] })) })),
                  Btn({ variant: 'ghost', size: 'xs', type: 'button', disabled: fields.length === 1,
                    'aria-label': LW('移除字段 ') + field.name, onClick: () => setFields(items => items.filter(item => item.id !== field.id)) }, h(Icon, { name: 'close' }))))),
              Btn({ variant: 'ghost', size: 'xs', type: 'button', disabled: fields.length >= 12,
                onClick: () => setFields(items => [...items, blankExtensionField()]) }, LW('添加字段')),
              h('div', { className: 'lw-actions' },
                Btn({ variant: 'ghost', type: 'button', onClick: () => setEditing(false) }, LW('收起')),
                Btn({ type: 'button', disabled: !extensionName.trim() || !description.trim() || fields.some(field => !field.name.trim()),
                  onClick: saveExtension }, LW('保存扩展范式'))))),
          h('label', null, LW('名字'), h('input', { required: true, maxLength: 80, value: label, disabled: busy,
            onChange: e => setLabel(e.target.value) })),
          error && h('p', { role: 'alert' }, error),
          h('div', { className: 'lw-actions lw-dialog-actions' },
            Btn({ variant: 'ghost', disabled: busy, onClick: close }, LW('取消')),
            Btn({ variant: 'primary', type: 'submit', disabled: busy || editing || !paradigm || !label.trim() }, LW(busy ? '创建中…' : '创建')))))
    }
    function FeatureBotEditDialog({ workspaceId, projectName, featureId, featMeta, currentLabel, currentHint, onSaved, onCancel }) {
      const autoCustomHint = `围绕「${currentLabel}」沉淀推送消息与文件资源`
      const initialHint = currentHint === autoCustomHint ? '' : (currentHint || '')
      const [hint, setHint] = React.useState(initialHint)
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
        if (busy) return
        setBusy(true); setError('')
        try {
          const result = await project(workspaceId, 'feature_update', {
            featureId, hint: hint.trim(), keywords: parsedKeywords,
          })
          await onSaved?.(result)
          window.dispatchEvent(new Event(updated))
          onCancel()
        } catch (err) {
          setError(err.message)
          setBusy(false)
        }
      }
      const badgeSymbol = botDisplayIcon(featMeta || { id: featureId })
      const sheetAccent = paradigmAccentFor(featMeta)
      return ReactDOM.createPortal(
        h('div', {
          className: 'lw-bot-sheet-backdrop',
          onClick: e => { if (e.target === e.currentTarget) dismiss() },
        },
          h('aside', {
            className: 'lw-bot-sheet',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': LW('修改功能 Bot 信息'),
          },
            h('div', { className: 'lw-bot-sheet-head' },
              h('button', {
                type: 'button',
                className: 'lw-dialog-close',
                'aria-label': LW('关闭功能 Bot 信息'),
                title: LW('关闭'),
                disabled: busy,
                onClick: dismiss,
              }, h(Icon, { name: 'close' }))),
            h('div', { className: 'lw-bot-sheet-hero' },
              h('span', { className: 'lw-bot-sheet-avatar', 'data-tone': featureId, style: sheetAccent ? { background: `color-mix(in srgb, ${sheetAccent} 16%, transparent)`, color: sheetAccent, boxShadow: 'none' } : undefined, 'aria-hidden': true },
                h(Icon, { name: badgeSymbol })),
              h('h2', { className: 'lw-bot-sheet-name' }, currentLabel || featureId),
              h('div', { className: 'lw-bot-sheet-pills' },
                projectName && h('span', { className: 'lw-bot-sheet-pill' }, projectName),
                parsedKeywords.slice(0, 3).map(k => h('span', { key: k, className: 'lw-bot-sheet-pill' }, k)))),
            h('form', { className: 'lw-bot-sheet-form', onSubmit: submit },
              h('div', { className: 'lw-bot-sheet-body lw-form' },
                h('div', { className: 'lw-bot-sheet-card' },
                  h('span', { className: 'lw-bot-sheet-card-title' }, LW('职责与关键词')),
                  h('label', null, LW('备注'),
                    h('textarea', { rows: 2, maxLength: 200, value: hint, disabled: busy, placeholder: LW('这个 Bot 负责什么？'), onChange: e => setHint(e.target.value) })),
                  h('label', null, LW('关键词'),
                    h('input', { value: tags, disabled: busy, placeholder: LW('例如：文献、引用、核查'), onChange: e => setTags(e.target.value) }))),
                h('div', { className: 'lw-bot-sheet-card' },
                  h('span', { className: 'lw-bot-sheet-card-title' }, LW('运行配置')),
                  h('div', { className: 'lw-bot-sheet-kv' }, h('span', null, LW('所属项目')), h('strong', null, projectName || LW('当前项目'))),
                  h('div', { className: 'lw-bot-sheet-kv' }, h('span', null, LW('功能标识')), h('code', { className: 'lw-mono' }, featureId)),
                  h('div', { className: 'lw-bot-sheet-kv' }, h('span', null, LW('模型配置')), h('strong', null, LW('继承 Weave 默认设置')))),
                error && h('p', { role: 'alert', style: { margin: 0 } }, error)),
              h('div', { className: 'lw-bot-sheet-foot' },
                Btn({ type: 'button', variant: 'ghost', disabled: busy, onClick: dismiss }, LW('取消')),
                Btn({ type: 'submit', variant: 'primary', disabled: busy }, busy ? LW('保存中…') : LW('保存')))))),
        document.body)
    }
    function ProjectForm({ busy, onPicked, onCancel, refresh, onCreated, pickDirectory }) {
      const [name, setName] = React.useState('')
      const [sources, setSources] = React.useState(() => [{ id: requestId(), path: '' }])
      const [waiting, setWaiting] = React.useState(false)
      const [picking, setPicking] = React.useState(false)
      const [error, setError] = React.useState('')
      const [id] = React.useState(requestId)
      const locked = busy || waiting || picking
      const changeSource = (sourceId, path) => setSources(previous =>
        previous.map(source => source.id === sourceId ? { ...source, path } : source))
      async function chooseSource(sourceId) {
        if (locked) return
        setPicking(true)
        setError('')
        try {
          const path = await pickDirectory()
          if (path) changeSource(sourceId, path)
        } catch {
          setError(LW('无法打开目录选择器，可以直接粘贴文件夹路径。'))
        } finally {
          setPicking(false)
        }
      }
      const submit = async e => {
        e.preventDefault()
        if (locked || !name.trim()) return
        setWaiting(true)
        setError('')
        try {
          const sourcePaths = sources.map(source => source.path.trim()).filter(Boolean)
          const row = await api('create', { name, requestId: id, sourcePaths })
          await refresh()
          if (onCreated) onCreated(row)
          else onPicked(row.path)
        } catch (err) { setError(err.message); setWaiting(false) }
      }
      const close = () => { if (!locked) onCancel() }
      return h(Dialog, { title: createWorkspaceProject, close }, h('form', { className: 'lw-form', onSubmit: submit },
        h('label', null, LW('项目名称'), h('input', { autoFocus: true, required: true, maxLength: 80, value: name,
          disabled: locked, onChange: e => setName(e.target.value) })),
        h('fieldset', { className: 'lw-create-sources', disabled: locked },
          h('legend', null, LW('来源文件夹（可选）')),
          h('p', { className: 'lw-hint' }, LW('文件留在原处，供本项目的助手和 Bot 只读访问。')),
          sources.map((source, index) => h('div', { key: source.id, className: 'lw-source-picker' },
            h('input', { value: source.path, 'aria-label': LW('来源文件夹路径 ') + (index + 1),
              placeholder: LW('选择文件夹或粘贴绝对路径'), onChange: e => changeSource(source.id, e.target.value) }),
            pickDirectory && Btn({ variant: 'secondary', 'aria-label': LW('选择来源文件夹 ') + (index + 1),
              onClick: () => chooseSource(source.id) }, LW('选择文件夹')),
            (source.path || sources.length > 1) && Btn({ variant: 'ghost',
              'aria-label': LW('移除来源文件夹 ') + (index + 1),
              onClick: () => setSources(previous => previous.length === 1
                ? [{ ...source, path: '' }] : previous.filter(item => item.id !== source.id)) },
            h(Icon, { name: 'close' })))),
          h('div', { className: 'lw-actions' }, Btn({ variant: 'ghost', size: 'xs',
            onClick: () => setSources(previous => [...previous, { id: requestId(), path: '' }]) },
          h(Icon, { name: 'plus' }), LW('添加来源文件夹')))),
        error && h('span', { role: 'alert' }, error),
        h('div', { className: 'lw-actions lw-dialog-actions' },
          Btn({ variant: 'ghost', onClick: close, disabled: locked }, LW('取消')),
          Btn({ variant: 'primary', type: 'submit', disabled: locked || !name.trim() },
            waiting ? LW('创建中…') : LW('创建')))))
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
      return h(Dialog, { title: LW('创建项目插件'), close: safeClose }, h('form', { className: 'lw-form', onSubmit: submit },
        h('label', null, LW('插件名称'), h('input', { required: true, autoFocus: true, maxLength: 80, value: name, onChange: e => setName(e.target.value) })),
        h('label', null, LW('适用范围'), h(Select, { value: scope, ariaLabel: LW('适用范围'), placeholder: LW('选择项目或全部项目'), onChange: setScope,
          options: [{ value: 'all', label: LW('全部项目') }, ...rows.filter(r => r.scope !== 'global').map(r => ({ value: r.scope, label: r.name }))] })),
        h('label', null, LW('交给项目助手的指令'), h('textarea', { rows: 4, required: true, maxLength: 12000, value: prompt, onChange: e => setPrompt(e.target.value) })),
        status && h('span', { role: 'alert' }, status),
        h('div', { className: 'lw-actions lw-dialog-actions' },
          Btn({ variant: 'ghost', onClick: safeClose, disabled: busy }, LW('取消')),
          Btn({ variant: 'primary', type: 'submit', disabled: busy || !name.trim() || !scope || !prompt.trim() }, LW('创建插件')))))
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
      return h(Dialog, { title: LW('重命名项目功能'), close }, h('form', { className: 'lw-form', onSubmit: submit },
        projectName && h('p', { className: 'lw-hint', style: { margin: 0 } }, `所属项目：${projectName}`),
        h('label', null, LW('功能显示名称'),
          h('input', { required: true, autoFocus: true, maxLength: 80, value: label, onChange: e => setLabel(e.target.value) })),
        err && h('p', { role: 'alert' }, err),
        h('div', { className: 'lw-actions lw-dialog-actions' },
          Btn({ variant: 'ghost', onClick: close, disabled: busy }, LW('取消')),
          Btn({ variant: 'primary', type: 'submit', disabled: busy || !label.trim() }, busy ? LW('保存中…') : LW('保存')))))
    }

    const isImageResource = item => Boolean(item && entryImageSrc(item) && /\.(png|jpe?g|webp|gif|svg)$/i.test(item.path || ''))
    const isReadableEntry = item => Boolean(item && !isImageResource(item) && (item.libraryId || item.path || item.url?.startsWith('/api/workspace/pdf/')))
    const libResKind = item => item.kind === 'pdf' || /\.pdf$/i.test(item.path || item.text) ? 'pdf'
      : item.kind === 'repository' ? 'repository'
      : item.kind === 'output' ? 'output'
      : item.kind === 'link' ? 'link' : 'file'

    function SpeakerReply({ label, text }) {
      return h('article', { className: 'lw-speaker-reply', 'aria-label': label + LW(' 的插话') },
        h('strong', null, label), h('div', null, text))
    }

    function composerCandidates(sessionId, trigger, query, signal) {
      return api('composer-candidates', { sessionId, trigger, query }, signal)
    }

    function useBotInputMenu(bot, textarea, onDraft) {
      const [hit, setHit] = React.useState(null)
      const [items, setItems] = React.useState([])
      const [active, setActive] = React.useState(0)
      const [status, setStatus] = React.useState('loading')
      const ensure = React.useRef(bot.ensureSession)
      ensure.current = bot.ensureSession
      const id = React.useId()
      function update(value, caret) {
        const match = /(?:^|\s)([@/])([^\s@]*)$/u.exec(value.slice(0, caret))
        if (match && (match[1] === '@' || !match[2].includes('/'))) {
          setHit({ start: caret - match[2].length - 1, end: caret, trigger: match[1], query: match[2] })
        } else setHit(null)
      }
      React.useEffect(() => {
        if (!hit) return
        const controller = new AbortController()
        setItems([])
        setActive(0)
        setStatus('loading')
        const timer = setTimeout(async () => {
          try {
            const sid = await ensure.current()
            const found = await composerCandidates(sid, hit.trigger, hit.query, controller.signal)
            if (!controller.signal.aborted) {
              setItems(found)
              setStatus('ready')
            }
          } catch {
            if (!controller.signal.aborted) setStatus('error')
          }
        }, 100)
        return () => { clearTimeout(timer); controller.abort() }
      }, [hit])
      function pick(item, drill = Boolean(item.drill)) {
        const input = textarea.current
        if (!input || !hit) return
        const text = drill ? '@' + item.drill : item.text + (hit.trigger === '@' ? ' ' : '')
        const next = input.value.slice(0, hit.start) + text + input.value.slice(hit.end)
        const caret = hit.start + text.length
        onDraft(next)
        if (drill) update(next, caret)
        else setHit(null)
        requestAnimationFrame(() => { input.focus(); input.setSelectionRange(caret, caret) })
      }
      function key(event) {
        if (!hit || event.nativeEvent?.isComposing) return false
        if (event.key === 'Escape') { setHit(null); event.preventDefault(); return true }
        if (items.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
          setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
          event.preventDefault()
          return true
        }
        if (items.length && !event.shiftKey && ['Enter', 'Tab'].includes(event.key)) {
          pick(items[active])
          event.preventDefault()
          return true
        }
        return false
      }
      return { update, key, close: () => setHit(null), controls: hit ? id : undefined,
        selected: hit && items.length ? id + '-' + active : undefined,
        menu: hit && h('div', { id, className: 'lw-composer-menu', role: 'listbox', 'aria-label': hit.trigger === '@' ? LW('引用与邀请') : LW('指令') },
          items.length === 0 && h('p', { role: 'status', className: 'lw-composer-menu-label' },
            LW(status === 'loading' ? '正在查找…' : status === 'error' ? '候选暂不可用' : '没有匹配项')),
          items.map((item, index) => h(React.Fragment, { key: item.text || item.drill },
            items[index - 1]?.section !== item.section && h('div', { className: 'lw-composer-menu-label' }, item.section),
            h('button', { id: id + '-' + index, type: 'button', role: 'option', 'aria-selected': index === active,
              onMouseDown: event => event.preventDefault(), onClick: () => pick(item) },
              h('span', null, item.name, item.drill && ' ›'), item.description && h('small', null, item.description))))) }
    }

    function TurnProgress({ progress, onApproval }) {
      const { text, topic, startedAt, pendingApproval } = progress
      const [now, setNow] = React.useState(Date.now)
      React.useEffect(() => {
        if (!startedAt) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [startedAt])
      const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
      const duration = elapsed >= 60 ? Math.floor(elapsed / 60) + ' 分 ' + elapsed % 60 + ' 秒' : elapsed + ' 秒'
      return h('div', { className: 'lw-turn-progress' },
        h('img', { src: './weave-orbit.svg', alt: '' }),
        h('div', { role: 'status', 'aria-atomic': true },
          h('span', { className: 'lw-turn-phase', title: text }, text),
          topic && h('span', { className: 'lw-turn-topic', title: topic }, topic)),
        elapsed > 0 && h('time', { 'aria-hidden': true, dateTime: 'PT' + elapsed + 'S' }, duration),
        pendingApproval && onApproval && Btn({ size: 'xs', onClick: onApproval }, LW('处理工具审批')))
    }

    const preparingReply = { text: LW('正在准备本轮回复') }
    let workbenchViews
    const getWorkbenchViews = () => workbenchViews ||= import(new URL('./labweave-bot-workbench.js', document.baseURI).href)
      .then(module => module.createWorkbenchViews(React, project, { Btn, Icon, Tag, Select, fmtDateTime, Canvas: BotParadigmView }))
    const GoalPlanner = React.lazy(() => import(new URL('./labweave-goal-planner.js', document.baseURI).href)
      .then(module => ({ default: module.createGoalPlanner(React) })))
    const BotExperiments = React.lazy(() => getWorkbenchViews().then(views => ({ default: views.Experiments })))

    function openComposerFile(input, imagesOnly) {
      if (!input || input.disabled) return
      const previous = input.getAttribute('accept')
      if (imagesOnly) input.setAttribute('accept', 'image/*')
      else input.removeAttribute('accept')
      try { input.click() }
      finally {
        if (previous === null) input.removeAttribute('accept')
        else input.setAttribute('accept', previous)
      }
    }

    function ComposerAttachmentMenu({ disabled, onPick }) {
      const [open, setOpen] = React.useState(false)
      const ref = React.useRef(null)
      const trigger = React.useRef(null)
      React.useEffect(() => {
        if (!open) return
        const dismiss = event => {
          if (!ref.current?.contains(event.target)) setOpen(false)
        }
        const escape = event => {
          if (event.key !== 'Escape') return
          setOpen(false)
          if (ref.current?.contains(document.activeElement)) trigger.current?.focus()
        }
        document.addEventListener('pointerdown', dismiss)
        document.addEventListener('keydown', escape)
        return () => {
          document.removeEventListener('pointerdown', dismiss)
          document.removeEventListener('keydown', escape)
        }
      }, [open])
      const pick = imagesOnly => {
        setOpen(false)
        trigger.current?.focus()
        onPick(imagesOnly, ref.current)
      }
      const label = LW('导入图片或文件')
      return h('div', { ref, className: 'lw-composer-attach' },
        h('button', { ref: trigger, type: 'button', className: 'lw-fbot-plus-btn',
          'aria-label': label, 'aria-expanded': open && !disabled, title: label, disabled,
          onClick: () => setOpen(previous => !previous),
        }, h(Icon, { name: 'plus' })),
        open && !disabled && h('div', { className: 'lw-fbot-plus-menu', role: 'group', 'aria-label': label },
          h('button', { type: 'button', onClick: () => pick(true) },
            h(Icon, { name: 'image' }), h('span', null, LW('导入图片'))),
          h('button', { type: 'button', onClick: () => pick(false) },
            h(Icon, { name: 'file' }), h('span', null, LW('导入文件')))))
    }

    function ExtensionElements({ values, fields, role, describeReference }) {
      if (!values) return null
      const descriptors = fields || Object.keys(values).map(name => ({ name, type: 'text', role: 'detail' }))
      const shown = descriptors.filter(field => values[field.name] != null && (!role || field.role === role))
      if (!shown.length) return null
      return h('dl', { className: 'lw-paradigm-fields' }, shown.map(({ name, type }) => {
        const value = values[name]
        const url = type === 'url' && mdSafeUrl(value)
        const display = url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, value)
          : type === 'reference' ? describeReference?.(value) || LW('关联记录不可用')
            : typeof value === 'boolean' ? LW(value ? '是' : '否') : String(value)
        return h('div', { key: name }, h('dt', null, name), h('dd', null, display))
      }))
    }

    function botDisplayRecord(item, fields, layout) {
      const roles = new Map(fields.map(field => [field.role, field]))
      const value = role => item.elements?.[roles.get(role)?.name]
      const [title, body] = entryHeadlineBody(item)
      const status = value('status')
      return {
        title: value('title') || title,
        summary: value('summary') || body,
        group: value('group') || item.category || item.priority,
        date: roles.has('date') ? value('date') : item.eventDate || (layout === 'lineage' ? null : item.updatedAt || item.ts),
        status: typeof status === 'boolean' ? roles.get('status').name + '：' + LW(status ? '是' : '否') : status,
        source: mdSafeUrl(value('source')) || item.url,
        relation: value('relation') || item.parentId,
      }
    }

    function BotParadigmView({ layout, items, fields = [], activeId, openEntry, toggleGoal, addNode, deleteNode, busy, emptyTitle, label = LW('内容画布') }) {
      const [category, setCategory] = React.useState(null)
      const [paths, setPaths] = React.useState([])
      const [camera, setCamera] = React.useState({ zoom: 100, x: 0, y: 0 })
      const [panning, setPanning] = React.useState(false)
      const [fullscreen, setFullscreen] = React.useState(false)
      const [size, setSize] = React.useState({ width: 0, height: 188 })
      const zoom = camera.zoom / 100
      const viewportRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const stageRef = React.useRef(null)
      function zoomBy(delta) {
        setCamera(current => ({ ...current, zoom: Math.max(50, Math.min(200, current.zoom + delta)) }))
      }
      function startPan(event) {
        if (event.button !== 0 || event.target.closest('button,input,a,label')) return
        const stage = stageRef.current
        const scale = stage.getBoundingClientRect().width / stage.offsetWidth / zoom || 1
        dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera, scale }
        event.currentTarget.setPointerCapture(event.pointerId)
        setPanning(true)
      }
      function movePan(event) {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        setCamera(current => ({ ...current, x: drag.camera.x + (event.clientX - drag.x) / drag.scale,
          y: drag.camera.y + (event.clientY - drag.y) / drag.scale }))
      }
      function endPan() {
        dragRef.current = null
        setPanning(false)
      }
      function resetCamera() {
        setCamera({ zoom: 100, x: 0, y: 0 })
        viewportRef.current?.scrollTo(0, 0)
      }
      React.useEffect(() => {
        const viewport = viewportRef.current
        function wheel(event) {
          if (!event.ctrlKey || !event.deltaY) return
          event.preventDefault()
          zoomBy(event.deltaY < 0 ? 10 : -10)
        }
        viewport.addEventListener('wheel', wheel, { passive: false })
        return () => viewport.removeEventListener('wheel', wheel)
      }, [fullscreen])
      const byId = new Map(items.map(item => [item.id, item]))
      const rows = items.map(item => ({ ...botDisplayRecord(item, fields, layout), item }))
      const categories = [...new Set(rows.map(row => row.item.canvasGroup || row.group || LW('未分类')))]
      const selected = categories.includes(category) ? category : null
      const visible = rows.filter(row => !selected || (row.item.canvasGroup || row.group || LW('未分类')) === selected)
      const ids = new Set(visible.map(row => row.item.id))
      const edges = visible.flatMap(row => [...new Set([
        row.relation, ...(Array.isArray(row.item.dependsOn) ? row.item.dependsOn : []),
      ])].filter(id => ids.has(id) && id !== row.item.id).map(id => ({ from: id, to: row.item.id })))
      const dated = layout === 'timeline' || layout === 'lineage'
      const sequential = dated || layout === 'reasoning'
      const graph = layout === 'graph' || layout === 'path'
      const lanes = new Map()
      const append = (key, row) => {
        if (!lanes.has(key)) lanes.set(key, [])
        lanes.get(key).push(row)
      }
      if (graph) {
        const depth = new Map()
        const byRecord = new Map(visible.map(row => [row.item.id, row]))
        const incoming = new Map(visible.map(row => [row.item.id, []]))
        for (const edge of edges) incoming.get(edge.to).push(edge.from)
        const successors = new Map()
        for (const { from } of edges) successors.set(from, (successors.get(from) || 0) + 1)
        const nodes = visible.map(row => ({ id: row.item.id, dependsOn: incoming.get(row.item.id) }))
          .sort((a, b) => (successors.get(b.id) || 0) - (successors.get(a.id) || 0))
        for (const item of orderGoalPath(nodes)) {
          const parents = incoming.get(item.id).filter(id => depth.has(id))
          const level = parents.length ? Math.min(10, 1 + Math.max(...parents.map(id => depth.get(id)))) : 0
          depth.set(item.id, level)
          append(level, byRecord.get(item.id))
        }
      } else if (sequential) {
        const direction = layout === 'timeline' ? -1 : 1
        const ordered = [...visible].sort((a, b) => {
          const left = Date.parse(dated ? a.date : a.item.ts)
          const right = Date.parse(dated ? b.date : b.item.ts)
          if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0
          if (!Number.isFinite(right)) return -1
          return direction * (left - right)
        })
        ordered.forEach((row, index) => append(index, row))
      } else {
        for (const row of visible) {
          const group = row.item.canvasGroup || (layout === 'checklist' && row.item.done ? LW('已完成') : row.group)
          append(group || (layout === 'checklist' ? LW('待办') : LW('未分类')), row)
        }
      }

      const edgeKey = JSON.stringify(edges)
      const visibleKey = JSON.stringify([...lanes].map(([key, entries]) => [key, entries.map(row => row.item.id)]))
      React.useLayoutEffect(() => {
        const stage = stageRef.current
        if (!stage) { setPaths([]); return }
        const nodes = new Map([...stage.querySelectorAll('[data-canvas-node]')].map(node => [node.dataset.canvasNode, node]))
        const links = JSON.parse(edgeKey)
        function measure() {
          const width = stage.offsetWidth, height = stage.offsetHeight
          setSize(current => current.width === width && current.height === height ? current : { width, height })
          const origin = stage.getBoundingClientRect()
          const scale = origin.width / stage.offsetWidth || 1
          const next = links.flatMap(({ from, to }) => {
            if (!nodes.has(from) || !nodes.has(to)) return []
            const source = nodes.get(from).getBoundingClientRect()
            const target = nodes.get(to).getBoundingClientRect()
            const across = Math.abs(source.left - target.left) / scale > 12
            const forward = across ? source.left < target.left : source.top < target.top
            const x = (across ? (forward ? source.right : source.left) : source.left + source.width / 2) - origin.left
            const y = (across ? source.top + source.height / 2 : (forward ? source.bottom : source.top)) - origin.top
            const endX = (across ? (forward ? target.left : target.right) : target.left + target.width / 2) - origin.left
            const endY = (across ? target.top + target.height / 2 : (forward ? target.top : target.bottom)) - origin.top
            const start = [x / scale, y / scale], end = [endX / scale, endY / scale]
            const middle = across ? (start[0] + end[0]) / 2 : (start[1] + end[1]) / 2
            const via = across ? [middle, start[1], middle, end[1]] : [start[0], middle, end[0], middle]
            return [{ from, to, end, d: 'M' + start.join(' ') + ' C' + via.join(' ') + ' ' + end.join(' ') }]
          })
          setPaths(next)
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(stage)
        for (const node of nodes.values()) observer.observe(node)
        return () => observer.disconnect()
      }, [edgeKey, visibleKey, layout, fullscreen])

      function card(row) {
        const item = row.item
        const file = isReadableEntry(item) || isImageResource(item)
        const thumbnail = entryImageSrc(item)
        const date = typeof row.date === 'string' && row.date.length === 10 ? row.date : fmtDate(row.date)
        const blocked = toggleGoal && !item.done && item.dependsOn?.some?.(id => byId.has(id) && !byId.get(id).done)
        const status = item.canvasStatus || row.status || item.relationStatus || (blocked && LW('等待前置目标'))
        const editable = !item.canvasDraft && !item.experiment?.kind
        return h('article', { key: item.id, className: 'lw-canvas-card', 'data-canvas-node': item.id, 'data-current': activeId === item.id,
          'data-draft': Boolean(item.canvasDraft) },
          h(openEntry ? 'button' : 'div', { className: 'lw-canvas-card-body',
            ...(openEntry && { type: 'button', 'aria-label': row.title, onClick: () => openEntry(item) }) },
            h('span', { className: 'lw-canvas-card-meta' },
              h(Icon, { name: file ? 'file' : row.source ? 'link' : graph ? 'mindmap' : 'list' }),
              dated && h('span', null, date || LW('日期待确认')),
              item.due && h('span', null, LW('截止 ') + item.due),
              item.canvasDraft && h('span', null, LW('草稿 · 待核验')),
              item.canvasDraft && h('span', null, ({ queued: LW('排队中'), running: LW('整理中'),
                needs_follow_up: LW('待继续'), completed: LW('已返回') })[item.dispatchStatus] || LW('已结束')),
              status && h('span', null, status),
              item.relationLabel && h('span', null, item.relationLabel)),
            h('strong', null, row.title),
            row.summary && row.summary !== row.title && h('span', { className: 'lw-paradigm-preview' }, row.summary),
            thumbnail && h('img', { className: 'lw-canvas-thumb', src: thumbnail, alt: '', loading: 'lazy',
              onError: event => { event.currentTarget.hidden = true } })),
          toggleGoal && editable && h('label', { className: 'lw-canvas-card-meta', style: {padding:'0 10px 8px', alignItems:'center'} },
            h('input', { type: 'checkbox', checked: Boolean(item.done), disabled: busy || blocked,
              'aria-label': LW('完成 ') + row.title, onChange: () => toggleGoal(item) }), LW('完成')),
          editable && (addNode || deleteNode) && h('div', { className: 'lw-canvas-node-actions' },
            addNode && Btn({ variant: 'ghost', size: 'xs', disabled: busy, title: LW('添加分支'),
              'aria-label': LW('添加分支 ') + row.title, onClick: () => addNode(item) }, '+'),
            deleteNode && Btn({ variant: 'ghost', size: 'xs', disabled: busy, title: LW('删除节点'),
              'aria-label': LW('删除节点 ') + row.title, onClick: () => deleteNode(item) }, '−')))
      }

      const canvas = h('section', { className: 'lw-bot-canvas', 'data-layout': layout, 'aria-label': label },
        h('div', { className: 'lw-canvas-toolbar' },
          addNode && Btn({ variant: 'ghost', size: 'xs', disabled: busy, onClick: () => addNode(null) }, LW('添加节点')),
          categories.length > 1 && h('div', { className: 'lw-canvas-categories', role: 'group', 'aria-label': LW('内容类别') },
            [null, ...categories].map(name => h('button', { key: name === null ? 'all' : 'category:' + name,
              type: 'button', 'aria-pressed': selected === name, onClick: () => setCategory(name) }, name ?? LW('全部')))),
          h('div', { className: 'lw-canvas-controls', role: 'group', 'aria-label': LW('画布视图') },
            Btn({ variant: 'ghost', size: 'xs', disabled: camera.zoom <= 50, 'aria-label': LW('缩小画布'), onClick: () => zoomBy(-10) }, '−'),
            h('span', { 'aria-label': LW('当前缩放') }, camera.zoom + '%'),
            Btn({ variant: 'ghost', size: 'xs', disabled: camera.zoom >= 200, 'aria-label': LW('放大画布'), onClick: () => zoomBy(10) }, '+'),
            Btn({ variant: 'ghost', size: 'xs', 'aria-label': LW('重置画布视图'), onClick: resetCamera }, LW('重置')),
            !fullscreen && Btn({ variant: 'ghost', size: 'xs', 'aria-label': LW('全屏画布'), onClick: () => setFullscreen(true) }, LW('全屏')))),
        h('div', { ref: viewportRef, className: 'lw-canvas-viewport', tabIndex: 0, role: 'region', 'aria-label': LW('节点与连线'),
          'data-panning': panning, onPointerDown: startPan, onPointerMove: movePan,
          onPointerUp: endPan, onPointerCancel: endPan, onLostPointerCapture: endPan },
          !items.length && emptyTitle && h('p', { className: 'lw-canvas-live' }, emptyTitle),
          h('div', { className: 'lw-canvas-frame', style: {
            width: Math.ceil(size.width * zoom + Math.max(0, camera.x)),
            height: Math.ceil(size.height * zoom + Math.max(0, camera.y)),
          } },
          h('div', { ref: stageRef, className: 'lw-canvas-stage',
            style: { transform: 'translate(' + camera.x + 'px,' + camera.y + 'px) scale(' + zoom + ')' } },
            h('svg', { className: 'lw-canvas-edges', 'aria-hidden': true },
              paths.map(link => h('g', { key: link.from + ':' + link.to, 'data-from': link.from, 'data-to': link.to },
                h('path', { d: link.d }), h('circle', { cx: link.end[0], cy: link.end[1], r: 2.5 })))),
            [...lanes.entries()].sort(([a], [b]) => graph ? a - b : 0).map(([label, entries]) =>
              h('div', { key: label, className: 'lw-canvas-lane' },
                typeof label === 'string' && h('h3', null, label), entries.map(card)))))))
      return fullscreen ? ReactDOM.createPortal(h(Dialog, {
        title: LW('全屏画布'), className: 'lw-canvas-full', close: () => setFullscreen(false),
      }, canvas), document.body) : canvas
    }

    function orderGoalPath(items) {
      const followers = new Map(items.map(item => [item.id, []]))
      const remaining = new Map()
      const result = []
      for (const item of items) {
        const deps = Array.isArray(item.dependsOn) ? item.dependsOn.filter(id => followers.has(id)) : []
        if (!deps.length) result.push(item)
        else remaining.set(item.id, deps.length)
        for (const id of deps) followers.get(id).push(item)
      }
      for (const item of result) {
        for (const next of followers.get(item.id)) {
          const pending = remaining.get(next.id) - 1
          if (pending) remaining.set(next.id, pending)
          else {
            remaining.delete(next.id)
            result.push(next)
          }
        }
      }
      return result.concat(items.filter(item => remaining.has(item.id)))
    }

    function Panel({
      workspaceId, row, feature, featMeta, title, subtitle, emptyTitle,
      value, loadError, persisted, bot, live, openModels, onRenamed,
      openExperiment,
    }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [reading, setReading] = React.useState(null)
      const [activeItemId, setActiveItemId] = React.useState(null)
      const [activeReview, setActiveReview] = React.useState(null)
      const [deletingItem, setDeletingItem] = React.useState(null)
      const [browserLink, setBrowserLink] = React.useState(null)
      const [boardPercent, setBoardPercent] = React.useState(persisted.boardPercent || 58)
      const [editingBot, setEditingBot] = React.useState(false)
      const [nodeEdit, setNodeEdit] = React.useState(null)
      const [draftText, setDraftText] = React.useState(() => persisted?.draft || '')

      const [editingId, setEditingId] = React.useState(null)
      const [editDraft, setEditDraft] = React.useState({ text: '', due: '' })
      const conversationRef = React.useRef(null)
      const mainRef = React.useRef(null)
      function resizeBoard(percent) {
        const next = Math.max(25, Math.min(80, Math.round(percent)))
        persisted.boardPercent = next
        setBoardPercent(next)
      }
      function moveDivider(event) {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const rect = mainRef.current.getBoundingClientRect()
        resizeBoard(100 * (event.clientY - rect.top) / rect.height)
      }
      React.useEffect(() => {
        const log = conversationRef.current
        if (log) log.scrollTop = log.scrollHeight
      }, [bot.messages.length])
      const fileInputRef = React.useRef(null)
      const textareaRef = React.useRef(null)
      const changeDraft = text => { setDraftText(text); persisted.draft = text }
      const inputMenu = useBotInputMenu(bot, textareaRef, changeDraft)

      React.useLayoutEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(120, Math.max(32, el.scrollHeight)) + 'px'
      }, [draftText])

      const run = async act => {
        if (busy) return
        setBusy(true); setError('')
        try {
          const result = await act()
          window.dispatchEvent(new Event(updated))
          return result
        }
        catch (err) { setError(err.message) } finally { setBusy(false) }
      }

      if (!value?.rails) {
        return h('div', { className: 'lw-panel', style: { padding: 24 }, role: loadError ? 'alert' : 'status' }, loadError || LW('正在读取项目…'))
      }

      const members = (value.features || []).filter(member => member.clusterParent === feature && !member.archived)
      const savedItems = members.length ? [{ id: feature, label: title }, ...members].flatMap(member =>
        (value.rails[member.id] || []).map(item => ({ ...item, canvasRail: member.id, canvasGroup: member.label })))
        : value.rails[feature] || []
      const items = [...savedItems, ...(live?.drafts || [])]
      const action = (name, args) => project(workspaceId, name, args)
      const ordered = items.slice().reverse()
      const botLayout = featMeta.layout
      const typedLayout = botLayout && botLayoutLabels[botLayout]
      const extensionFields = featMeta.extension?.fields || []
      const effectiveParadigm = featMeta.extension?.base || featMeta.paradigm
      const engineering = effectiveParadigm === 'engineering'
      const goalPlanner = effectiveParadigm === 'goals' && botLayout === 'calendar'
      const saveGoal = (item, changes) => run(() => action('feature_push', {
        featureId: item?.canvasRail || feature,
        ...(item ? { id: item.id } : { source: '用户' }),
        ...changes,
      }))
      const paradigmAccent = botParadigms[effectiveParadigm]?.accent
      const addNode = parent => setNodeEdit({ parent, title: '', text: '' })
      const deleteNode = item => setNodeEdit({ remove: item })
      const closeNodeEdit = () => { if (!busy) setNodeEdit(null) }
      async function saveNode(event) {
        event.preventDefault()
        if (nodeEdit.remove) {
          return run(async () => {
            const item = nodeEdit.remove
            await action('entry_delete', { rail: item.canvasRail || feature, id: item.id })
            if (activeItemId === item.id) setActiveItemId(null)
            setNodeEdit(null)
          })
        }
        const name = nodeEdit.title.trim()
        if (!name) return
        return run(async () => {
          const parent = nodeEdit.parent
          await action('feature_push', { featureId: parent?.canvasRail || feature, title: name,
            text: nodeEdit.text.trim() || name, source: '用户',
            ...(parent && { parentId: parent.id, category: botDisplayRecord(parent, extensionFields, botLayout).group }) })
          setNodeEdit(null)
        })
      }

      async function readResource(id, page = 1) {
        setBusy(true)
        setError('')
        try {
          const res = await action('read', { id, page })
          setReading({ id, ...res })
        } catch (failure) {
          setError(failure.message)
        } finally {
          setBusy(false)
        }
      }

      const openEntry = entry => {
        if (!entry) return
        setDeletingItem(null)
        setBrowserLink(null)
        setError('')
        setReading(null)
        if (entry._metaType === 'review') {
          setReading(null); setActiveItemId(null)
          setActiveReview(entry)
          return
        }
        setActiveReview(null)
        setActiveItemId(entry.id)
      }

      const importFile = file => run(async () => {
        const data = await fileUploadData(file)
        const res = await action('upload', { name: file.name, data, featureId: feature })
        setNotice(LW('已导入文件：') + file.name)
        const targetEntry = res.linkedItem || res
        if (targetEntry?.id) openEntry(targetEntry)
      })

      const submitComposer = async e => {
        e?.preventDefault?.()
        const text = draftText.trim()
        if (!text || bot.sending) return
        inputMenu.close()
        changeDraft('')
        try {
          await bot.sendPrompt(text)
        } catch (err) {
          if (!persisted.draft) changeDraft(text)
          setError(err.message)
        }
      }

      const activeItem = activeItemId ? items.find(x => x.id === activeItemId) : null
      const activeDisplay = activeItem && botDisplayRecord(activeItem, extensionFields, botLayout)
      const attachment = activeItem && (activeItem.libraryId || activeItem.path || isReadableEntry(activeItem)) && (libraryItemsFor(activeItem) || activeItem)
      function libraryItemsFor(item) {
        const resources = value.rails.library || []
        return resources.find(entry => entry.id === (item.libraryId || item.id) || (item.path && entry.path === item.path))
      }
      function closeDetail() {
        if (busy) return
        setActiveItemId(null); setActiveReview(null); setReading(null); setDeletingItem(null); setEditingId(null); setBrowserLink(null)
      }
      const libraryItems = value.rails.library || []
      const libraryUrls = new Set(libraryItems.map(x => x.url).filter(Boolean))
      const goalsList = value.rails.goals || []
      const linkedIdeaIds = new Set(goalsList.map(g => g.ideaId).filter(Boolean))

      const progress = (bot.running && bot.progress) || (bot.sending && preparingReply)
      const hasDetail = Boolean(reading || activeItem || activeReview)
      const hasContent = typedLayout || items.length > 0 || hasDetail || (feature === 'ideas' && (value.reviews?.length || 0) > 0)

      const kindBadges = { paper: LW('论文'), news: LW('新闻'), repository: LW('仓库'), pdf: 'PDF', output: LW('实验产物'), link: LW('链接'), file: LW('文件'), push: LW('推送'), fresh: LW('灵感'), converted: LW('已转目标'), pending: LW('追踪中'), completed: LW('已完成') }
      const entryKindKey = item => {
        const isFile = isReadableEntry(item) || isImageResource(item)
        if (feature === 'feed') return isFile ? 'file' : feedKind(item)
        if (feature === 'ideas') return isFile ? 'file' : (linkedIdeaIds.has(item.id) ? 'converted' : 'fresh')
        if (feature === 'goals') return isFile ? 'file' : (item.done ? 'completed' : 'pending')
        if (feature === 'library') return libResKind(item)
        return isFile ? 'file' : (item.kind || 'push')
      }
      const entryBadgeLabel = item => kindBadges[entryKindKey(item)] || title
      const detailLabel = feature === 'feed' ? LW('动态详情') : LW('记录详情')
      const showRecordHeader = Boolean(activeItem && !reading && !browserLink && !activeReview && editingId !== activeItem.id)
      const recordText = String(activeItem?.text || '').trim()
      const hasRecordTitle = activeItem?.title || extensionFields.some(field => field.role === 'title' && activeItem?.elements?.[field.name])
      const plainShortTitle = recordText.length <= 44 && !/[\n：:]/.test(recordText) ? recordText : ''
      const recordTitle = hasRecordTitle ? activeDisplay?.title : plainShortTitle
      const recordHeader = showRecordHeader && h('div', { className: 'lw-record-heading' },
        h('div', { className: 'lw-record-meta' },
          h(Tag, { tone: 'neutral' }, entryBadgeLabel(activeItem)),
          activeItem.ts && h('time', { className: 'lw-hint lw-mono', dateTime: activeItem.ts }, fmtDateTime(activeItem.ts))),
        h('h2', null, inlineMarkdown(recordTitle || detailLabel, 'record-title')))
      const catIcon = key => ({
        paper: 'file', news: 'activity', repository: 'repo',
        fresh: 'ideas', converted: 'goals', review: 'spark',
        pending: 'goals', completed: 'check', workflows: 'activity',
        pdf: 'file', output: 'spark', link: 'link',
        file: 'file', push: 'bot',
      }[key] || featureIcon(feature))
      const doneGoals = feature === 'goals' ? items.filter(x => x.done).length : 0
      const goalPct = feature === 'goals' && items.length ? Math.round((doneGoals / items.length) * 100) : 0
      const ringCircumference = 2 * Math.PI * 13
      return h('section', {
        className: 'lw-panel lw-fbot-shell',
        style: { flex: 1, minHeight: 0, gap: 0, '--lw-paradigm-accent': paradigmAccent },
        'data-paradigm': paradigmAccent ? effectiveParadigm : undefined,
        'aria-label': title,
      },
        h('div', { ref: mainRef, className: 'lw-fbot-main', style: { '--lw-board-size': boardPercent + '%' } },
          h('div', { className: 'lw-fbot-scroll' },
            h('div', { className: 'lw-fbot-center' },
              h('header', { className: 'lw-fbot-head' },
                h('button', {
                  type: 'button', className: 'lw-bot-pill',
                  'aria-label': LW('修改功能 Bot 信息 ') + title,
                  title: LW('查看或编辑功能 Bot 信息'),
                  onClick: () => setEditingBot(true),
                },
                  h('span', { className: 'lw-bot-pill-badge', 'data-tone': feature, 'aria-hidden': true },
                    h(Icon, { name: botDisplayIcon(featMeta) })),
                  h('span', { className: 'lw-bot-pill-name' }, title),
                  h('span', { className: 'lw-bot-pill-edit', 'aria-hidden': true }, h(Icon, { name: 'edit' })))),

              h('div', { className: 'lw-bot-board' },
              Boolean(live?.active) && h('p', { className: 'lw-canvas-live', role: 'status' },
                live.active + LW(' 项任务正在整理，草稿随进度更新')),
              busy && h('p', { role: 'status', className: 'lw-hint' }, LW('正在处理…')),
              notice && h('p', { role: 'status', className: 'lw-notice' }, notice),
              (error || bot.error) && h('p', { role: 'alert', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                h('span', null, error || bot.error),
                openModels && /模型|API|key|密钥/i.test(error || bot.error) && Btn({ variant: 'ghost', size: 'xs', onClick: openModels }, LW('模型与 API 设置'))),

              engineering && h(React.Suspense, { fallback: h('p', { className: 'lw-hint' }, LW('正在读取实验…')) },
                h(BotExperiments, { workspaceId, featureId: feature, updatedEvent: updated, layout: botLayout,
                  records: ordered.map(item => ({ ...botDisplayRecord(item, extensionFields, botLayout), id: item.id, item })),
                  addNode, deleteNode, busy,
                  openRecord: record => openEntry(record.item) })),
              !hasContent && !engineering ? h('div', { className: 'lw-fbot-empty-wrap' },
                h('div', { className: 'lw-empty' },
                  h('div', { className: 'lw-empty-emblem', 'aria-hidden': true }, h(Icon, { name: botDisplayIcon(featMeta) })),
                  h('strong', null, emptyTitle),
                  h('div', { className: 'lw-empty-chips' },
                    h('button', { type: 'button', className: 'lw-empty-chip', onClick: () => fileInputRef.current?.click() },
                      h(Icon, { name: 'upload' }), h('span', null, LW('上传文件'))))))
                : h(React.Fragment, null,
                  !typedLayout && feature === 'goals' && items.length > 0 && h('div', { className: 'lw-fbot-stats', 'aria-label': title + LW(' 进度概览') },
                    h('div', { className: 'lw-fbot-stats-top' },
                      h('div', { className: 'lw-goal-ring-wrap' },
                        h('svg', { className: 'lw-goal-ring', viewBox: '0 0 34 34', 'aria-hidden': true },
                          h('circle', { className: 'lw-goal-ring-bg', cx: 17, cy: 17, r: 13 }),
                          h('circle', {
                            className: 'lw-goal-ring-fg', cx: 17, cy: 17, r: 13,
                            strokeDasharray: ringCircumference,
                            strokeDashoffset: ringCircumference * (1 - goalPct / 100),
                          })),
                        h('div', { style: { display: 'grid', lineHeight: 1.3 } },
                          h('strong', { style: { fontSize: 'var(--lw-ui-sm)' } }, `完成 ${doneGoals} / ${items.length}`),
                          h('span', { className: 'lw-hint lw-mono', style: { fontSize: 'var(--lw-ui-xs)' } }, goalPct + '%'))))),

                  hasDetail && ReactDOM.createPortal(h(Dialog, {
                    title: detailLabel, wide: true, close: closeDetail,
                    className: showRecordHeader ? 'lw-record-dialog' : '', header: recordHeader,
                  },
                    h('div', { className: 'lw-canvas-detail-body' },
                    error && h('p', { role: 'alert', className: 'lw-error' }, error),
                    browserLink ? h(React.Fragment, null,
                      h('div', { className: 'lw-actions' },
                        Btn({ variant: 'ghost', size: 'xs', onClick: () => setBrowserLink(null) }, LW('返回详情')),
                        h('a', { className: 'lw-btn lw-btn-secondary lw-btn-xs', href: browserLink, target: '_blank', rel: 'noopener noreferrer' }, LW('在新标签页打开'))),
                      h('iframe', { className: 'lw-dynamic-browser', title: LW('动态原文'),
                        src: browserLink, sandbox: 'allow-scripts', referrerPolicy: 'no-referrer' }))
                    : reading ? h('section', { className: 'lw-reader-pane', style: { position: 'static' }, 'aria-label': LW('资源内容') },
                      h('div', { className: 'lw-reader-head' },
                        h('strong', { style: { fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 140px' } },
                          activeItem?.text || libraryItems.find(x => x.id === reading.id)?.text || LW('资源阅读')),
                        h('div', { className: 'lw-actions' },
                          reading.pages && Btn({ variant: 'secondary', size: 'xs', disabled: busy || reading.page <= 1, onClick: () => readResource(reading.id, reading.page - 1, activeItem) }, LW('上一页')),
                          reading.pages && h('span', { className: 'lw-hint lw-mono' }, reading.page, ' / ', reading.pages),
                          reading.pages && Btn({ variant: 'secondary', size: 'xs', disabled: busy || reading.page >= reading.pages, onClick: () => readResource(reading.id, reading.page + 1, activeItem) }, LW('下一页')),
                          Btn({ variant: 'ghost', size: 'xs', onClick: () => setReading(null) }, LW('返回详情')))),
                      h('pre', { className: 'lw-reader-body' }, reading.text || reading.files?.join('\n') || LW('该页没有可提取文本。')))
                    : activeReview ? h('div', { style: { display: 'grid', gap: 8 } },
                      h('strong', null, LW('AI 复盘详情')),
                      h('span', { className: 'lw-hint lw-mono' }, fmtDateTime(activeReview.ts)),
                      h(RecordBody, { source: activeReview.reply }))
                    : activeItem && h('article', { className: 'lw-record-content' },
                      !showRecordHeader && h('div', { className: 'lw-fbot-detail-head' },
                        h('div', { className: 'lw-actions' },
                          h(Tag, { tone: 'neutral' }, entryBadgeLabel(activeItem)),
                          activeItem.ts && h('span', { className: 'lw-hint lw-mono' }, fmtDateTime(activeItem.ts)))),
                      editingId === activeItem.id ? h('form', { className: 'lw-form', onSubmit: e => {
                        e.preventDefault(); if (!editDraft.text.trim()) return
                        run(async () => {
                          const changes = { id: activeItem.id, text: editDraft.text.trim() }
                          if (goalPlanner) {
                            await action('feature_push', { ...changes, featureId: activeItem.canvasRail || feature,
                              title: editDraft.title, plannedDate: editDraft.plannedDate || null, due: editDraft.due,
                              completionCriteria: editDraft.completionCriteria, kind: editDraft.milestone ? 'milestone' : 'task' })
                          } else {
                            await action(feature === 'goals' ? 'goal_update' : 'idea_update', {
                              ...changes, ...(feature === 'goals' && { due: editDraft.due }),
                            })
                          }
                          setEditingId(null)
                        })
                      } },
                        goalPlanner && h('label', null, LW('标题'),
                          h('input', { className: 'lw-input', value: editDraft.title, onChange: e => setEditDraft({ ...editDraft, title: e.target.value }) })),
                        h('textarea', { className: 'lw-textarea', rows: 3, value: editDraft.text, onChange: e => setEditDraft({ ...editDraft, text: e.target.value }) }),
                        goalPlanner && [['安排日期', 'plannedDate', 'date'], ['截止日期', 'due', 'date'], ['完成条件', 'completionCriteria', 'text']].map(([label, key, type]) =>
                          h('label', { key }, LW(label), h('input', { type, className: 'lw-input', value: editDraft[key],
                            onChange: e => setEditDraft({ ...editDraft, [key]: e.target.value }) }))),
                        goalPlanner && h('label', null, h('input', { type: 'checkbox', checked: editDraft.milestone,
                          onChange: e => setEditDraft({ ...editDraft, milestone: e.target.checked }) }), LW('标记为里程碑')),
                        feature === 'goals' && h('input', { type: 'date', className: 'lw-input', value: editDraft.due || '', onChange: e => setEditDraft({ ...editDraft, due: e.target.value }) }),
                        h('div', { className: 'lw-actions' },
                          Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy }, LW('保存')),
                          Btn({ variant: 'ghost', size: 'xs', onClick: () => setEditingId(null) }, LW('取消'))))
                      : (() => {
                        const activeImgSrc = entryImageSrc(activeItem)
                        return h(React.Fragment, null,
                          recordText !== recordTitle && h(RecordBody, { source: recordText }),
                          h(ExtensionElements, { values: Object.fromEntries([
                            [LW('安排日期'), activeItem.plannedDate], [LW('截止日期'), activeItem.due],
                            [LW('完成条件'), activeItem.completionCriteria], [LW('假设'), activeItem.hypothesis],
                            [LW('最小验证'), activeItem.validation], [LW('结果'), activeItem.result],
                            [LW('关系类型'), activeItem.relationLabel], [LW('核查状态'), activeItem.relationStatus],
                          ].filter(([, value]) => value)) }),
                          h(ExtensionElements, { values: activeItem.elements, fields: featMeta.extension?.fields?.filter(field => field.role !== 'title'),
                            describeReference: id => {
                              const target = items.find(item => item.id === id)
                              return target && botDisplayRecord(target, extensionFields, botLayout).title
                            } }),
                          activeImgSrc && h(EntryImage, { src: activeImgSrc, alt: activeItem.caption || activeItem.title || LW('推送配图'),
                            className: 'lw-fbot-detail-media', illustrated: true, caption: activeItem.caption }),
                          attachment && h('div', { className: 'lw-actions lw-canvas-attachment' },
                            h('span', { className: 'lw-actions' }, h(Icon, { name: 'file' }),
                              attachment.path?.split(/[\\/]/).pop()?.replace(/^[a-f0-9]{32}-/, '') || attachment.text),
                            isReadableEntry(activeItem) && Btn({ size: 'xs', disabled: busy,
                              onClick: () => readResource(attachment.id, 1, activeItem) }, LW('预览文件'))),
                          h(EntrySource, { item: activeItem }),
                          !activeItem.canvasDraft && h('div', { className: 'lw-actions lw-record-actions' },
                            Btn({ variant: 'danger', size: 'xs', className: 'lw-record-delete', disabled: busy,
                              onClick: () => setDeletingItem(activeItem.id) }, feature === 'feed' ? LW('删除动态') : LW('删除记录')),
                            feature === 'feed' && mdSafeUrl(activeDisplay.source) &&
                              Btn({ size: 'xs', onClick: () => setBrowserLink(mdSafeUrl(activeDisplay.source)) }, LW('在弹窗中浏览原文')),
                            feature === 'feed' && Btn({ variant: 'primary', size: 'xs', disabled: busy, onClick: () => run(async () => {
                              await action('idea_create', { text: activeItem.text, ...(activeItem.url ? { url: activeItem.url } : {}) })
                              setNotice(LW('已保存到「点子」。'))
                            }) }, LW('转为点子')),
                            feature === 'feed' && activeItem.url && /^https?:\/\//i.test(activeItem.url) && Btn({ variant: 'secondary', size: 'xs', disabled: busy || libraryUrls.has(activeItem.url), onClick: () => run(async () => {
                              await action('link', { url: activeItem.url, text: activeItem.text, kind: feedKind(activeItem) })
                              setNotice(LW('已收藏到「资源库」。'))
                            }) }, libraryUrls.has(activeItem.url) ? LW('已收藏') : LW('收藏到资源库')),
                            feature === 'ideas' && Btn({ variant: 'primary', size: 'xs', disabled: busy || linkedIdeaIds.has(activeItem.id), onClick: () => run(async () => {
                              await action('goal_create', { text: activeItem.text, ideaId: activeItem.id })
                              setNotice('已转化为项目目标。')
                            }) }, linkedIdeaIds.has(activeItem.id) ? LW('已转目标') : LW('转为目标')),
                            feature === 'goals' && Btn({ variant: 'primary', size: 'xs', disabled: busy, onClick: () => run(() => action('goal_update', { id: activeItem.id, done: !activeItem.done })) }, activeItem.done ? LW('标为未完成') : LW('标记完成')),
                            (feature === 'ideas' || feature === 'goals' || goalPlanner) &&
                              Btn({ variant: 'ghost', size: 'xs', onClick: () => {
                                setEditingId(activeItem.id)
                                setEditDraft({ text: activeItem.text, title: activeItem.title || '', due: activeItem.due || '',
                                  plannedDate: activeItem.plannedDate || '', completionCriteria: activeItem.completionCriteria || '',
                                  milestone: activeItem.kind === 'milestone' })
                              } }, LW('编辑'))),
                          deletingItem === activeItem.id && h('div', { className: 'lw-actions lw-record-delete-confirm' },
                            h('span', null, LW('删除这条记录及其连线？')),
                            Btn({ size: 'xs', disabled: busy, onClick: () => setDeletingItem(null) }, LW('取消')),
                            Btn({ variant: 'danger', size: 'xs', disabled: busy, onClick: () => run(async () => {
                              const rail = activeItem.canvasRail || feature
                              if (rail === 'feed') await action('dismiss_feed', { id: activeItem.id, key: activeItem.url || activeItem.text })
                              else await action('entry_delete', { rail, id: activeItem.id })
                              setActiveItemId(null); setDeletingItem(null)
                            }) }, LW('确认删除'))))
                      })()))), document.body),

                  goalPlanner && h(React.Suspense, { fallback: h('p', { className: 'lw-hint' }, LW('正在读取待办…')) },
                    h(GoalPlanner, { items: ordered, busy, openEntry, onSave: changes => saveGoal(null, changes),
                      onMove: (item, plannedDate) => saveGoal(item, { plannedDate }),
                      onToggle: item => saveGoal(item, { done: !item.done }),
                      onDecision: (item, accept) => run(() => action('goal_draft_decision', {
                        featureId: item.canvasRail || feature, id: item.id, accept,
                      })),
                      onSuggest: request => run(async () => {
                        await bot.sendPrompt(LW('请结合这个项目的资料和进度，把下面的计划拆成少量、可验收的待办草稿。') +
                          LW('用本目标 Bot 的记录工具逐条保存，给出归属阶段和完成条件；日期不明确时不要猜。') +
                          LW('只提出建议，不改正式排期或完成状态。') + '\n\n' + request)
                        return true
                      }) })),
                  typedLayout && !engineering && !goalPlanner && h(BotParadigmView, {
                    layout: botLayout, items: ordered, fields: extensionFields, activeId: activeItemId, openEntry, busy,
                    addNode, deleteNode, emptyTitle,
                    toggleGoal: effectiveParadigm === 'goals' ? item => run(() =>
                      action('feature_push', { featureId: item.canvasRail || feature, id: item.id, done: !item.done })) : null,
                  }),
                  ordered.length > 0 && !typedLayout && !engineering && (feature === 'library'
                    ? h('div', { className: 'lw-doc-grid', 'aria-label': title + LW(' 上下文记录') },
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
                              h(Tag, { tone: 'neutral' }, kindBadges[kind] || title),
                              readable && Btn({ variant: 'secondary', size: 'xs', onClick: e => { e.stopPropagation(); openEntry(item) } }, LW('阅读')))))
                      }))
                    : h('div', { style: { display: 'grid', gap: 8 }, 'aria-label': title + LW(' 上下文记录') },
                      ordered.map(item => {
                        const [headline, body] = entryHeadlineBody(item)
                        const imgSrc = entryImageSrc(item)
                        const isActive = activeItemId === item.id || reading?.id === item.id || (item.libraryId && reading?.id === item.libraryId)
                        const readable = isReadableEntry(item)
                        const entryKey = entryKindKey(item)
                        const itemIcon = item.done ? 'check' : catIcon(entryKey || feature)
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
                              'aria-label': LW('完成 ') + item.text,
                              onClick: e => e.stopPropagation(),
                              onChange: e => run(() => action('goal_update', { id: item.id, done: e.target.checked })),
                            })
                            : h('span', { className: 'lw-fbot-card-icon', 'aria-hidden': true }, h(Icon, { name: itemIcon })),
                          h('div', { className: 'lw-fbot-card-body' },
                            h('div', { className: 'lw-stream-head', style: { marginBottom: 0 } },
                              h('button', { type: 'button', className: 'lw-stream-title lw-fbot-card-title',
                                onClick: e => { e.stopPropagation(); openEntry(item) } }, headline),
                              h('div', { className: 'lw-actions' },
                                item.due && h('span', { className: 'lw-hint lw-mono', style: { fontSize: 'var(--lw-ui-xs)' } }, item.due),
                                h(Tag, { tone: item.done ? 'success' : 'neutral' }, entryBadgeLabel(item)),
                                readable && Btn({ variant: 'secondary', size: 'xs', onClick: e => { e.stopPropagation(); openEntry(item) } }, LW('阅读')))),
                            (body || (!imgSrc && item.caption)) && h('div', { className: 'lw-muse-row-sub' }, body || item.caption)),
                          imgSrc && h(EntryImage, { src: imgSrc, alt: item.caption || headline,
                            className: 'lw-fbot-detail-media', illustrated: true, caption: item.caption }),
                          h(ExtensionElements, { values: item.elements }),
                          h(EntrySource, { item }))
                      }))))))),
          h('div', { className: 'lw-bot-divider', role: 'separator', tabIndex: 0,
            'aria-label': LW('调整画布与对话高度'), 'aria-orientation': 'horizontal',
            'aria-valuemin': 25, 'aria-valuemax': 80, 'aria-valuenow': boardPercent,
            onPointerDown: event => { if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId) },
            onPointerMove: moveDivider,
            onKeyDown: event => {
              const changes = { ArrowUp: boardPercent - 4, ArrowDown: boardPercent + 4, Home: 25, End: 80 }
              if (changes[event.key] === undefined) return
              event.preventDefault()
              resizeBoard(changes[event.key])
            },
          }),
          h('section', { className: 'lw-bot-conversation', 'aria-label': LW('与 Bot 对话') },
            h('div', { ref: conversationRef, className: 'lw-bot-conversation-log' },
              h('div', { className: 'lw-bot-conversation-log-inner' },
                  (bot.messages.length > 0 || progress) && h('div', { className: 'lw-bot-turns', 'aria-label': title + LW(' 对话记录') },
                    bot.messages.map(msg => msg.role === 'speaker' ? h(SpeakerReply, { key: msg.id, label: msg.label, text: msg.text })
                      : h('div', { key: msg.id, className: 'lw-bot-msg', 'data-role': msg.role, 'data-pending': msg.pending || undefined },
                      h('div', { className: 'lw-bot-msg-meta' },
                        h('span', null, msg.role === 'user' ? LW('你') : title),
                        h('div', { className: 'lw-bot-msg-actions' },
                          msg.time && h('span', { className: 'lw-mono' }, fmtDateTime(msg.time)),
                          msg.pending ? h('span', { role: 'status' }, LW('发送中…'))
                            : h(RewindButton, { role: msg.role, disabled: bot.running || bot.sending,
                            onClick: () => bot.openRewind(msg, draft => {
                              const restored = persisted.draft ? persisted.draft + '\n\n' + draft : draft
                              persisted.draft = restored
                              setDraftText(restored)
                              requestAnimationFrame(() => textareaRef.current?.focus())
                            }) }))),
                      msg.text.replace(/@\[((?:\\.|[^\\\]])*)\]\((?:weave-ref|dsh-session):[A-Za-z0-9_-]+\)/gu, '@$1'))),
                    progress && h(TurnProgress, { progress, onApproval: bot.openApproval })))),

          h('form', { className: 'lw-fbot-composer-wrap', onSubmit: submitComposer },
            h('div', { className: 'lw-fbot-composer' },
              inputMenu.menu,
              h('input', {
                ref: fileInputRef,
                type: 'file',
                'aria-label': LW('导入文件'),
                disabled: busy,
                style: { display: 'none' },
                onChange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f) },
              }),
              h(ComposerAttachmentMenu, { disabled: busy, onPick: imagesOnly => openComposerFile(fileInputRef.current, imagesOnly) }),
              h('textarea', {
                ref: textareaRef,
                rows: 1,
                'aria-label': LW('向 ') + title + LW(' 发送消息'),
                placeholder: LW('消息，/ 指令，@ 引用或邀请'),
                'aria-controls': inputMenu.controls,
                'aria-activedescendant': inputMenu.selected,
                'aria-autocomplete': 'list',
                value: draftText,
                onChange: e => { changeDraft(e.target.value); inputMenu.update(e.target.value, e.target.selectionStart) },
                onBlur: inputMenu.close,
                onKeyDown: e => {
                  if (inputMenu.key(e)) return
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault()
                    submitComposer()
                  }
                },
              }),
              h('button', {
                type: 'submit',
                className: 'lw-fbot-send-btn',
                'aria-label': LW('发送'),
                title: bot.sending ? LW('发送中…') : LW('发送'),
                disabled: busy || bot.sending || !draftText.trim(),
              }, h(Icon, { name: 'send' })))))),

        nodeEdit && ReactDOM.createPortal(h(Dialog, {
          title: nodeEdit.remove ? LW('删除节点') : nodeEdit.parent ? LW('添加分支') : LW('添加节点'), close: closeNodeEdit,
        }, h('form', { className: 'lw-form', onSubmit: saveNode },
          nodeEdit.remove ? h('p', null, LW('删除「') + botDisplayRecord(nodeEdit.remove, extensionFields, botLayout).title
            + LW('」及其连线？下级节点会保留。'))
            : h(React.Fragment, null,
              nodeEdit.parent && h('p', { className: 'lw-hint' }, LW('上级节点 ') + botDisplayRecord(nodeEdit.parent, extensionFields, botLayout).title),
              h('label', null, LW('节点标题'), h('input', { autoFocus: true, required: true, maxLength: 200,
                value: nodeEdit.title, onChange: event => setNodeEdit({ ...nodeEdit, title: event.target.value }) })),
              h('label', null, LW('节点内容'), h('textarea', { rows: 3, maxLength: 4000,
                value: nodeEdit.text, onChange: event => setNodeEdit({ ...nodeEdit, text: event.target.value }) }))),
          error && h('p', { role: 'alert' }, error),
          h('div', { className: 'lw-actions lw-dialog-actions' },
            Btn({ variant: 'ghost', disabled: busy, onClick: closeNodeEdit }, LW('取消')),
            Btn({ variant: nodeEdit.remove ? 'danger' : 'primary', type: 'submit', disabled: busy },
              LW(nodeEdit.remove ? '确认删除' : '保存节点'))))), document.body),
        editingBot && h(FeatureBotEditDialog, {
          workspaceId, projectName: row?.name, featureId: feature, featMeta,
          currentLabel: title, currentHint: subtitle,
          onSaved: onRenamed, onCancel: () => setEditingBot(false),
        }))
    }

    const paths = {
      mindmap: 'M12 6v5M5 17v-5h14v5M12 12v5M9 3h6v4H9zM2 17h6v4H2zM9 17h6v4H9zM16 17h6v4h-6z',
      rewind: 'M3 11h11a5 5 0 0 1 0 10h-2M3 11l5-5M3 11l5 5',
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
      globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a16 16 0 0 1 0 20 16 16 0 0 1 0-20Z',
      fingerprint: 'M12 10a2 2 0 0 0-2 2c0 1.4-.3 2.8-.9 4 M12 10a2 2 0 0 1 2 2c0 2.2-.5 4.2-1.4 6 M8.5 14.5c.3-1.2.5-2.4.5-3.5a3 3 0 0 1 6 0c0 1.8-.3 3.5-1 5.2 M5.5 13c.2-1 .3-2 .3-3a6.2 6.2 0 0 1 12.4 0c0 1.2-.1 2.4-.4 3.5 M6.8 6.5A8 8 0 0 1 17.2 6.5',
      back: 'M15 18l-6-6 6-6',
      upload: 'M12 16V4 M7 9l5-5 5 5 M4 19h16',
      download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
      image: 'M4 5.5h16v13H4z M8.2 9.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z M4.8 16.5l5-5.2 3.2 3.2 2.2-2.1 4.8 4.1',
      file: 'M7 3h7l5 5v13H7z M14 3v5h5',
      cube: 'M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5z M3.5 7.25 12 12l8.5-4.75 M12 12v9.5',
      repo: 'M7 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M17 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M7 11v6 M17 17v-1a3 3 0 0 0-3-3H9',
      refresh: 'M20 11a8 8 0 1 0-2.35 6.35 M20 4v7h-7',
      spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
      check: 'M5 13l4 4L19 7',
      link: 'M10 13a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 5.8 M14 11a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3',
      memory: 'M9 3h6v4h4v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7h4z M9 12h6 M9 16h4',
    }
    function Icon({ name }) {
      if (name === 'clock-outline') {
        return h('svg', {
          className: 'lw-icon', viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true,
          'data-icon': 'dsw-icon-clock-outline-regular',
        },
          h('path', { d: 'M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z' }),
          h('path', { d: 'M8 4.31V8.46L11 10.08' }))
      }
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
    const chatTitle = s => s.title?.trim() || (s.blank ? LW('新对话') : LW('未命名对话'))

    const featureIcon = id => paths[id] ? id : 'bot'
    const fallbackFeatures = () => Object.entries(features).map(([id, label]) => ({
      id, label, builtin: true, deletable: id !== 'chat', hint: '', emptyText: '', categories: [], botSessionId: null,
    }))

    function install(ctx) {
      // The host supplies fixed display labels in the authenticated index, before rendering.
      const toolLabels = JSON.parse(document.getElementById('weave-tool-labels')?.textContent || '{}')
      const toolLabel = name => {
        const action = name.slice('labweave_'.length)
        return Object.hasOwn(toolLabels, action) ? toolLabels[action] : 'Weave 工具：' + action
      }
      const nativeWorkLabels = {
        read: '阅读工作区文件', write: '写入工作区文件', edit: '修改工作区文件',
        bash: '运行工作区命令', powershell: '运行工作区命令', web_search: '检索网页',
        grep: '查找工作区内容', glob: '查找工作区文件',
      }
      // Use the active turn's events and stream block types to describe progress.
      function conversationProgress(entries) {
        const start = entries.findLastIndex(entry => entry.event.type === 'turn/start')
        if (start < 0) return preparingReply
        const calls = new Map(), approvals = new Set()
        let topic = '', phase = 'preparing', result
        for (let index = start + 1; index < entries.length; index++) {
          const { event } = entries[index]
          const data = event.data
          switch (event.type) {
            case 'turn/end': return null
            case 'user/message':
              if (['user', rewindKind].includes(data.source?.kind)) {
                const input = data.content.filter(part => part.type === 'text').map(part => part.text).join(' ').replace(/\s+/g, ' ').trim()
                if (input) topic = input.length > 80 ? input.slice(0, 80) + '…' : input
              } else if (data.source?.kind === 'schedule' && !topic) topic = LW('定时任务')
              break
            case 'step/start':
            case 'assistant/attempt':
            case 'llm/retry-started':
              phase = 'waiting'
              break
            case 'llm/retry':
              phase = 'retry'
              break
            case 'assistant/live-chunk': {
              const chunk = data.chunk
              if (chunk.type === 'reasoning-delta' && chunk.text.trim()) phase = 'reasoning'
              if (chunk.type === 'text-delta' && chunk.text.trim()) phase = 'reply'
              break
            }
            case 'assistant/message':
              if (data.message?.content?.some(part => part.type === 'text' && part.text.trim())) phase = 'reply'
              break
            case 'tool/call': {
              const name = data.name.replace(/^labweave_/, '')
              const label = Object.hasOwn(toolLabels, name) ? toolLabels[name]
                : Object.hasOwn(nativeWorkLabels, name) ? nativeWorkLabels[name] : ''
              calls.set(data.callId, label)
              break
            }
            case 'tool/result': {
              const callId = data.message?.toolCallId
              if (calls.has(callId)) {
                result = { label: calls.get(callId), failed: data.message?.isError }
                phase = 'result'
              }
              calls.delete(callId)
              break
            }
            case 'approval/asked':
              approvals.add(data.id)
              break
            case 'approval/decided':
              approvals.delete(data.id)
              break
          }
        }
        let text
        if (approvals.size) text = LW('等待你的工具授权')
        else if (calls.size > 1) text = '正在处理 ' + calls.size + ' 个工具任务'
        else if (calls.size === 1) {
          const [label] = calls.values()
          text = label ? '正在' + label : LW('正在执行工具')
        } else if (result && ['waiting', 'result'].includes(phase)) {
          text = result.failed ? LW('工具返回错误，正在处理')
            : result.label ? '正在整理「' + result.label + '」的结果' : LW('正在整理工具结果')
        } else {
          text = {
            preparing: preparingReply.text, waiting: LW('正在等待模型响应'), reasoning: LW('正在推理'),
            reply: LW('正在生成回复'), retry: LW('模型响应中断，正在重试'),
          }[phase]
        }
        return { text, topic, startedAt: entries[start].event.time, pendingApproval: approvals.size > 0 }
      }
      ctx.effect(() => observeToolSummaries(toolLabel), 'Weave tool card labels')
      let rows = []
      let disposed = false
      let revision = 0, choice, nameStrings, initialNavigation = false
      let assistantEntrance, foldedAssistantId
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
            list.push({ value: `${g.id}/${m.id}`, provider: g.id, model: m.id, label: `${m.name || m.id}（${pName}）` })
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
      const assistantModelKey = 'labweave.assistant-model.v1'
      function readLegacyAssistantModel() {
        try {
          const raw = JSON.parse(localStorage.getItem(assistantModelKey) || 'null')
          if (raw?.mode === 'fixed' && typeof raw.provider === 'string' && typeof raw.model === 'string')
            return { mode: 'fixed', provider: raw.provider, model: raw.model }
        } catch {}
      }
      const isGlobalSessionId = sid => {
        const catalog = ctx.workspaces?.list?.getSnapshot?.() || { items: [] }
        const ws = (catalog.items || []).find(w => w.sessionIds?.includes(sid))
        return Boolean(ws && rows.some(r => r.workspaceId === ws.workspaceId && r.scope === 'global'))
      }
      const ensureSessionRoutableModel = async (sid, ref = null) => {
        if (!sid || syncingSessions.has(sid)) return
        const sess = ctx.sessions?.list?.getSnapshot?.().byId?.[sid]
        if (!sess || sess.origin === 'subagent' || sess.running) return
        syncingSessions.add(sid)
        try {
          if (!rows.length || isGlobalSessionId(sid)) return
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
      const currentRow = (current = currentSession()) => {
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
        if (!row) throw Error(LW('项目工作区未连接。'))
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
          if (!global) { notice(LW('无法打开全局助手，请重新连接 Weave 服务。')); return }
          forgetPage()
          const last = sessionsFor(global.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot(), allBotSessionIds())[0]
          if (!options && last) openChat(last.id)
          else start(global.workspaceId, options)
        }
        if (rows.length) openGlobal()
        else ready.then(() => rows.length ? openGlobal() : refresh().then(openGlobal)).catch(err => notice(err.message))
      }), 'LabWeave global new session')
      const migrateAssistantModel = ready.then(async () => {
        const legacy = readLegacyAssistantModel()
        if (legacy) await api('assistant-model', { preference: legacy, initialize: true })
      }).catch(() => {})
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
        if (row?.scope === 'global') throw Error(LW('全局助手保留所有全局对话。可在侧栏归档单个会话。'))
        if (row) await api('delete', { workspaceId: id })
        const result = await remove(id)
        splitPanes = splitPanes.filter(p => p.workspaceId !== id)
        await refresh()
        window.dispatchEvent(new Event(updated))
        return result
      }), 'LabWeave global workspace lifetime')
      if (typeof ctx.locale.translate === 'function') ctx.effect(() => wrap(ctx.locale, 'translate', (original, ns, key, params) => {
        if (ns === 'approval' && key === 'escalation' && params?.toolName?.startsWith('labweave_')) {
          return original(ns, key, { ...params, toolName: toolLabel(params.toolName) })
        }
        if (ns === 'chat' && (key === 'message.toolAdded' || key === 'message.toolRemoved') && params?.name?.startsWith('labweave_')) {
          return original(ns, key, { ...params, name: toolLabel(params.name) })
        }
        const branded = brandedTranslation(original, ns, key, params, ctx.locale.getSnapshot().active)
        if (branded !== undefined) return branded
        const originalText = original(ns, key, params)
        if (ns === 'chat' && (key === 'chat.deepDiving' || key === 'chat.deepDivingFor')) {
          return originalText.replace(/^深度求索中/, '深度思考中')
        }
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
            ? LW('和助手聊聊你的想法…') : LW('在这个项目里继续讨论…')
        }
        if (!['workspace', 'schedule.manager'].includes(ns)) return originalText
        const cn = /[\u3400-\u9fff]/.test(originalText)
        if (key === 'workspace.defaultName' || key === 'host.defaultProject') return rows.find(r => r.scope === 'global')?.name || originalText
        if (key === 'section.workspaces' && (cn || originalText === 'Workspaces')) return cn ? LW('工作区') : 'Workspaces'
        if (key === 'workspace.add' && (cn || /^add workspace$/i.test(originalText))) return cn ? createWorkspaceProject : 'New workspace project'
        return originalText
      }), 'LabWeave project labels')
      ctx.effect(() => {
        const apiEntries = new WeakMap()
        const filterSlots = (entriesFn, name, ...rest) => {
          const list = entriesFn(name, ...rest)
          if (name === 'settings.onboarding') return list.filter(entry => entry.options?.id !== 'welcome-notice').map(entry => {
            if (entry.options?.id !== 'deepseek-official' || entry.component === ApiOnboarding) return entry
            if (!apiEntries.has(entry)) apiEntries.set(entry, { ...entry, component: ApiOnboarding })
            return apiEntries.get(entry)
          })
          if (name === 'settings.models.sign-in') return []
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
          // The native subagent plugin supplies both the breadcrumb control and the header catalog.
          if (name === 'conversation.session.header.lineage') return []
          if (name === 'conversation.session.header.actions') {
            return list.filter(e => e.options?.id !== 'subagent-catalog' && !String(e.options?.id || '').startsWith('__lw_sync'))
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
          const id = '__lw_sync_' + slotName.replace(/\W+/g, '_')
          const key = slotName === 'conversation.chat.commandview' ? id : undefined
          const stop = ctx.slots.inject(slotName, () => {
            const dispose = ctx.slots.register({ name: slotName, id, key, order: 999, label: '' }, () => null)
            dispose()
            return () => {}
          })
          stop()
        }
        for (const name of ['settings.onboarding', 'settings.action', 'settings.section', 'settings.general.item', 'sidebar.panellist', 'sidebar.right.tab.guide.actions', 'conversation.session.header.views.actions', 'conversation.input.model.options', 'conversation.session.header.actions.subagent.footer', 'conversation.chat.commandview']) bump(name)
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
        const syncRoom = () => {
          const panel = ctx.layout.panelInfo.getSnapshot()
          const session = currentSession()
          const row = currentRow(session)
          const room = panel.activePanelId ? 'page' : (!row || row.scope === 'global' ? 'global' : 'project')
          const { dataset } = document.documentElement
          if (dataset.lwRoom !== room) dataset.lwRoom = room
          if (panel.activePanelId === pageKey || panel.activePanelId === welcomeKey) setAssistantBrandHidden(false)
          else if (panel.activePanelId == null && session) {
            if (room === 'project' || allBotSessionIds().has(session.id)) setAssistantBrandHidden(false)
            else if (row?.scope === 'global' && (initialNavigation || !session.blank) && !assistantEntrance) setAssistantBrandHidden(true)
          }
        }
        window.addEventListener(nameChanged, names)
        window.addEventListener(profileChanged, names)
        let updateTimer, catalogTimer
        const offSessions = ctx.sessions.list.subscribe(() => {
          syncRoom()
          clearTimeout(updateTimer)
          updateTimer = setTimeout(() => { names(); window.dispatchEvent(new Event(updated)) }, 300)
        })
        const offWorkspaces = ctx.workspaces.list.subscribe(() => {
          syncRoom()
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
        const offPanel = ctx.layout.panelInfo.subscribe(syncRoom)
        window.addEventListener(navEvent, syncRoom)
        brandTitle()
        syncRoom()
        return () => {
          disposed = true; nameStrings?.(); titleObserver.disconnect(); style.remove()
          window.removeEventListener(nameChanged, names); window.removeEventListener(profileChanged, names)
          window.removeEventListener(navEvent, syncRoom)
          offSessions(); offWorkspaces(); offPanel(); clearTimeout(updateTimer); clearTimeout(catalogTimer)
          delete document.documentElement.dataset.lwRoom
          setAssistantBrandHidden(false)
        }
      }, 'LabWeave appearance')

      const slot = (name, options, component) => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component))
      const speakerRepliesByHistory = new WeakMap()
      function NativeSpeakerReplies({ binding, messageId }) {
        const history = useStore(binding.eventSource)
        let byMessage = speakerRepliesByHistory.get(history)
        if (!byMessage) {
          byMessage = new Map()
          const events = history.entries.map(entry => entry.event)
          const cuts = rewindCuts(events)
          for (const event of events) {
            if (event.type !== 'user/message' || event.data.source.kind !== 'labweave-speaker' || isRewound(cuts, event.seq)) continue
            const { replyTo, label } = event.data.source
            if (!byMessage.has(replyTo)) byMessage.set(replyTo, [])
            byMessage.get(replyTo).push(h(SpeakerReply, { key: event.seq, label, text: featureBotMessageText(event) }))
          }
          speakerRepliesByHistory.set(history, byMessage)
        }
        return byMessage.get(messageId) || null
      }
      const referenceKind = 'labweave-reference'
      ctx.effect(() => ctx.uiConversation.userText.register({
        id: referenceKind, order: 15,
        match(text, from) {
          const pattern = /@\[((?:\\.|[^\\\]])*)\]\(weave-ref:[A-Za-z0-9_-]+\)/gu
          pattern.lastIndex = from
          const match = pattern.exec(text)
          return match ? { id: referenceKind, start: match.index, end: pattern.lastIndex,
            data: { label: match[1].replace(/\\(.)/gu, '$1') } } : undefined
        },
      }), 'Weave composer reference labels')
      slot('conversation.user.text.node', { key: referenceKind }, ({ node }) =>
        h('span', { className: 'lw-tag', 'data-tone': 'neutral' }, '@' + node.data.label))
      ctx.inject(['inputTriggers'], scope => {
        const service = scope.get?.('inputTriggers') ?? scope.inputTriggers
        if (!service?.live?.sources) return
        scope.effect(() => {
          const belongs = sid => {
            const ws = ctx.workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(sid))
            return ws && rows.some(item => item.workspaceId === ws.workspaceId)
          }
          const restores = []
          function adapt(source) {
            if (!['/', '@'].includes(source.trigger)) return
            const primary = source.name === (source.trigger === '/' ? 'command' : 'reference')
            restores.push(wrap(source, 'candidates', async (original, session, req) => {
              if (!belongs(session.sessionId)) return original(session, req)
              if (!primary) return []
              try {
                const found = await composerCandidates(session.sessionId, source.trigger, req.query, req.signal)
                return found.map(item => ({
                  name: item.name, description: item.description, section: item.section,
                  icon: item.section === '对话' || item.section === '邀请发言' ? 'session'
                    : item.section === '空间存储' ? 'file' : item.drill ? 'folder' : undefined,
                  ...(item.drill && { drill: true }),
                  value: JSON.stringify({ weave: item }),
                }))
              } catch (error) {
                if (req.signal?.aborted) return []
                throw error
              }
            }))
            if (source.trigger === '/') {
              for (const key of ['matchEnter', 'matchClaim', 'lexicon']) {
                if (typeof source[key] === 'function') {
                  restores.push(wrap(source, key, (original, session, ...args) =>
                    belongs(session.sessionId) ? undefined : original(session, ...args)))
                }
              }
            }
            if (!primary) return
            if (source.trigger === '@' && typeof source.openReference === 'function') {
              restores.push(wrap(source, 'openReference', (original, session, ref) =>
                ref.ref?.includes('weave-ref:') ? false : original(session, ref)))
            }
            restores.push(wrap(source, 'onPick', (original, args) => {
              let chosen
              try { chosen = JSON.parse(args.candidate.value || '{}').weave } catch {}
              if (!chosen) return original(args)
              if (chosen.tab) {
                const sid = args.session.sessionId
                requestAnimationFrame(() => {
                  if (currentSession()?.id !== sid) return
                  try {
                    ctx.sidebarRight.openTabIn(sid, chosen.tab)
                    ctx.sidebarRight.actionsFor?.(sid)?.setExpanded?.(sid, true)
                  } catch (err) { notice(err.message) }
                })
                return { text: '' }
              }
              if (chosen.drill && (args.action === 'drill' || !chosen.text)) return { text: '@' + chosen.drill, continue: true }
              if (source.trigger === '@') return { insert: { source: 'reference', ref: chosen.text,
                label: chosen.label || chosen.name, appearance: chosen.section === '对话' || chosen.section === '邀请发言' ? 'session' : 'file',
                clipboardText: chosen.text } }
              return { text: chosen.text }
            }))
          }
          for (const source of service.live.sources) adapt(source)
          const restoreRegister = wrap(service, 'registerSource', (register, source) => {
            adapt(source)
            return register(source)
          })
          return () => { restoreRegister(); restores.reverse().forEach(restore => restore()) }
        }, 'Weave session-specific input menus')
      })
      function openConversationRewind(sessionId, role, address, restore) {
        const binding = ctx.sessions.binding(sessionId)
        const entries = binding?.eventSource.getSnapshot().entries
        if (!entries?.length) return
        const tail = entries.findLast(({ event }) => event.type === 'assistant/message'
          || (event.type === 'user/message' && (event.data.source.kind === 'user' || rewindStart(event) !== undefined)))?.event.seq
        const target = entries.find(({ event }) => typeof address === 'number' ? event.seq === address
          : event.type === 'assistant/message' && event.data.message.id === address)?.event
        if (tail === undefined || !target) return
        const hasAttachments = role === 'user' && target.data.content.some(block => block.type === 'file' || block.type === 'image')
        window.dispatchEvent(new CustomEvent(rewindEvent, { detail: { sessionId, seq: target.seq, role, tail, restore, hasAttachments } }))
      }

      function NativeRewindButton({ sessionId, role, address }) {
        useNav()
        const workspaces = useStore(ctx.workspaces.list)
        const workspace = workspaces.items.find(item => item.sessionIds.includes(sessionId))
        if (!workspace || workspaces.archivedSessionIds.includes(sessionId)
            || !rows.some(item => item.workspaceId === workspace.workspaceId)) return null
        return h(RewindButton, { role, onClick: () => openConversationRewind(sessionId, role, address, async draft => {
          await ctx.sessions.using(sessionId, { source: 'conversationRewind' }, async ref => {
            await ref.ready
            const result = ctx.conversation.input.requestDraftInitialization(ref.binding, {
              prompt: draft, whenDraftExists: 'append',
            })
            if (result === 'blocked') throw Error('输入框正在提交。')
            requestAnimationFrame(() => {
              const scope = ctx.sessions.scope(sessionId)
              if (scope) ctx.conversation.input.for(scope).focus()
            })
          })
        }) })
      }

      ctx.effect(() => {
        const views = ctx.uiConversation.views
        let entry, create, replacement
        function attach() {
          const next = views.entries().find(item => item.target === 'chat')
          if (!next || next === entry) return
          if (entry && entry.create === replacement) entry.create = create
          entry = next
          const original = create = next.create
          replacement = () => rewindChatView(original.call(next))
          next.create = replacement
        }
        const off = views.subscribe(attach)
        attach()
        const dispose = ctx.uiConversation.events.register({
          kind: rewindKind, target: 'chat',
          match: event => Number.isSafeInteger(rewindStart(event)) ? { id: String(event.seq), role: 'start' } : null,
          start: (_context, { event }) => ({ from: rewindStart(event), to: event.seq }),
          buildViewNode: context => context.state && {
            key: context.key, kind: rewindKind, id: context.id, target: 'chat', data: context.state,
            anchorSeq: context.state.to, location: context.start.location, visibility: 'hidden',
          },
        })
        return () => {
          off()
          dispose()
          if (entry && entry.create === replacement) entry.create = create
        }
      }, 'Weave conversation rewind')

      // The fixed native version supplies an assistant action seat. Preserve the
      // native input renderer and add our action alongside its existing Copy control.
      ctx.effect(() => {
        const name = 'conversation.chat.node'
        const wrapped = new Map()
        function attach() {
          for (const entry of ctx.slots.entries(name)) {
            if (!['user', 'steering'].includes(entry.options.key) || (entry.options.priority ?? 0) !== 0
                || wrapped.has(entry)) continue
            const original = entry.component
            const render = original?.type ?? original
            if (typeof render !== 'function') continue
            const replacement = props => {
              const row = render(props)
              const actions = row?.props?.actions
              const seq = props.node?.data?.seq
              const userRow = typeof actions !== 'function' || !Number.isSafeInteger(seq) ? row
                : React.cloneElement(row, { actions: text => {
                const footer = actions(text)
                return React.cloneElement(footer, { extraActions: h(React.Fragment, null,
                  footer.props.extraActions, h(NativeRewindButton, { sessionId: props.sessionId, role: 'user', address: seq })) })
              } })
              const messageId = props.node?.data?.messageId
              const binding = messageId && ctx.sessions.binding(props.sessionId)
              return binding ? h(React.Fragment, null, userRow, h(NativeSpeakerReplies, { binding, messageId })) : userRow
            }
            entry.component = replacement
            wrapped.set(entry, { original, replacement })
          }
        }
        const off = ctx.slots.subscribe(name, attach)
        attach()
        return () => {
          off()
          for (const [entry, { original, replacement }] of wrapped) {
            if (entry.component === replacement) entry.component = original
          }
        }
      }, 'Weave user message actions')
      slot('conversation.chat.assistant-actions', { id: 'labweave-rewind', inject: sessionId => ({ sessionId }) },
        ({ sessionId, messageId }) => h(NativeRewindButton, { sessionId, role: 'assistant', address: messageId }))
      slot('shell.overlay', { id: 'labweave-rewind' }, function RewindOverlay() {
        const [target, setTarget] = React.useState(null)
        React.useEffect(() => {
          const open = event => setTarget(event.detail)
          window.addEventListener(rewindEvent, open)
          return () => window.removeEventListener(rewindEvent, open)
        }, [])
        return target && h(RewindDialog, { key: target.sessionId + ':' + target.seq, target, close: () => setTarget(null) })
      })
      function GlobalConversationProgress({ binding }) {
        const session = useStore(binding.session)
        const history = useStore(binding.eventSource)
        const anchor = React.useRef(null)
        const [target, setTarget] = React.useState(null)
        React.useLayoutEffect(() => {
          if (!session.running) {
            setTarget(null)
            return
          }
          const conversation = anchor.current?.closest('[data-conversation-content][data-conversation-session]')
          if (!conversation) return
          // The pinned client owns the running row inside the message list.
          const locate = () => setTarget(conversation.querySelector('[data-chat-running]:not([data-holding])'))
          locate()
          const observer = new MutationObserver(locate)
          observer.observe(conversation, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-chat-running', 'data-holding'] })
          return () => observer.disconnect()
        }, [session.running])
        const progress = session.running && conversationProgress(history.entries)
        return h(React.Fragment, null, h('span', { hidden: true, ref: anchor }),
          target && progress && ReactDOM.createPortal(
            h('div', { className: 'lw-assistant-progress' }, h(TurnProgress, { progress })), target))
      }
      function ProjectHandoffs({ sessionId }) {
        const [items, setItems] = React.useState([])
        const [error, setError] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const sending = React.useRef(false)
        const isVisible = () => Boolean(document.querySelector(
          '[data-conversation-content][data-conversation-session="' + CSS.escape(sessionId) + '"]')?.getClientRects().length)
        async function forward(item, confirm) {
          if (sending.current || !isVisible()) return
          sending.current = true
          setBusy(true)
          setError('')
          const command = (action, args = {}) => api('project-handoffs', { sessionId, id: item.id, action, ...args })
          let claimed, accepted = false, submitted = false
          try {
            const row = rows.find(entry => entry.scope === item.projectId)
            if (!row || row.scope === 'global') throw Error(LW('目标项目已不可用。'))
            const workspaces = ctx.workspaces.list.getSnapshot()
            const sessions = ctx.sessions.list.getSnapshot()
            const eligible = sessionsFor(row.workspaceId, workspaces, sessions, allBotSessionIds())
            const target = recentSessionFor(row.workspaceId, eligible.filter(entry => !entry.blank)) || eligible.find(entry => entry.blank)
            const sid = target?.id || await ctx.sessions.create({ workspaceId: row.workspaceId })
            if (!isVisible()) return
            claimed = await command('claim', { targetSessionId: sid, confirm })
            await ctx.sessions.using(sid, { source: 'projectHandoff' }, async ref => {
              await ref.ready
              await ensureSessionRoutableModel(sid, ref)
              const projectSession = ref.binding.session
              submitted = true
              const result = await projectSession.prompt([{ type: 'text', text: claimed.task }], 'queue')
              if (result?.ok === false) {
                submitted = false
                throw Error(sessionErrorText(result.error) || LW('目标项目会话暂时无法接单。'))
              }
              accepted = true
            })
            await command('sent', { claim: claimed.claim }).catch(() => {})
            if (isVisible()) openChat(sid)
          } catch (err) {
            if (claimed && !accepted && !submitted) await command('release', { claim: claimed.claim }).catch(() => {})
            setError(err.message)
          } finally {
            sending.current = false
            setBusy(false)
          }
        }
        React.useEffect(() => {
          const ctrl = new AbortController()
          let loading = false
          async function refresh() {
            if (loading || sending.current) return
            loading = true
            try {
              const pending = await api('project-handoffs', { sessionId }, ctrl.signal)
              if (ctrl.signal.aborted) return
              setItems(pending)
              const next = pending.find(item => item.status === 'ready')
              if (next) await forward(next, false)
            } catch { /* Retry on the next refresh. */ }
            finally { loading = false }
          }
          void refresh()
          const timer = setInterval(refresh, 1000)
          return () => { ctrl.abort(); clearInterval(timer) }
        }, [sessionId])
        if (!items.length && !error) return null
        return h('section', { className: 'lw-project-handoffs', 'aria-label': LW('项目转交') },
          error && h('p', { role: 'alert' }, error),
          items.map(item => h('article', { key: item.id, className: 'lw-speaker-reply' },
            h('strong', null, LW('转交项目 ') + item.projectName),
            h('p', null, item.task),
            item.status === 'sending' ? Btn({ size: 'xs', onClick: () => openChat(item.targetSessionId) }, LW('到项目会话查看'))
              : h('div', { className: 'lw-actions' },
              h('span', { className: 'lw-hint' }, item.status === 'ready' ? LW('正在准备转交') : LW('等待确认')),
              Btn({ variant: 'primary', size: 'xs', disabled: busy, onClick: () => forward(item, true) }, LW('确认并转交')),
              Btn({ variant: 'ghost', size: 'xs', disabled: busy, onClick: async () => {
                try {
                  await api('project-handoffs', { sessionId, id: item.id, action: 'dismiss' })
                  setItems(previous => previous.filter(entry => entry.id !== item.id))
                } catch (err) { setError(err.message) }
              } }, LW('取消'))))))
      }
      slot('shell.overlay', { id: 'labweave-project-handoffs' }, function HandoffOverlay() {
        useNav()
        const sessions = useStore(ctx.sessions.list)
        const workspaces = useStore(ctx.workspaces.list)
        const global = rows.find(row => row.scope === 'global')
        const workspace = global && workspaces.items.find(item => item.workspaceId === global.workspaceId)
        const sessionId = workspace?.sessionIds.find(id => sessions.byId[id]?.retainedBy.mainView > 0)
        return sessionId ? h(ProjectHandoffs, { key: sessionId, sessionId }) : null
      })
      slot('conversation.input.dock', { id: 'labweave-messenger', order: 12, inject: sessionId => ({ sessionId }) }, ({ sessionId }) => {
        useNav()
        const workspace = useStore(ctx.workspaces.list).items.find(w => w.sessionIds.includes(sessionId))
        if (!workspace || !rows.some(r => r.workspaceId === workspace.workspaceId && r.scope === 'global')) return null
        const scope = '[data-conversation-session="' + CSS.escape(sessionId) + '"]'
        const binding = ctx.sessions.binding(sessionId)
        return h(React.Fragment, null,
          h('style', { 'data-lw-messenger': sessionId }, [
            scope + ' [data-slot="conversation.input.model"],' + scope + ' [data-slot="conversation.input.permission"],' + scope + ' [data-slot="conversation.input.plan"],' + scope + ' [class*="uV2eYG_select"],' + scope + ' [class*="uV2eYG_modes"],' + scope + ' [data-composer-card] button[class$="_add"]{display:none!important}',
            scope + ' [data-chat-flow-kind="turn-process"],' + scope + ' [data-step-process"],' + scope + ' [data-chat-call-id],' + scope + ' [data-tool]{display:none!important}',
            scope + ' [data-variant="think"]{display:none!important}',
            scope + ' [data-content-phase="active"] [class*="scrollBody"],' + scope + ' [data-phase="active"] [class*="scrollBody"]{padding-top:8px}',
          ].join('')),
          binding && h(GlobalConversationProgress, { key: sessionId, binding }))
      })
      slot('conversation.input.left', { id: 'labweave-assistant-attach', order: -20, inject: sessionId => ({ sessionId }) }, ({ sessionId }) => {
        useNav()
        const workspace = useStore(ctx.workspaces.list).items.find(w => w.sessionIds.includes(sessionId))
        if (!workspace || !rows.some(r => r.workspaceId === workspace.workspaceId && r.scope === 'global')) return null
        return h(ComposerAttachmentMenu, { onPick: (imagesOnly, anchor) => {
          const input = anchor?.closest('[data-composer-card]')?.querySelector('input[type="file"]')
          openComposerFile(input, imagesOnly)
        } })
      })
      const BrandMark = ({ size }) => h('img', {
        src: './weave-orbit.svg', alt: '', 'aria-hidden': true, draggable: false,
        width: size, height: size, className: 'lw-brand-mark',
      })
      function setAssistantBrandHidden(hidden) {
        document.documentElement.toggleAttribute('data-lw-assistant-brand-hidden', hidden)
      }
      function queueAssistantEntrance(button) {
        const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches &&
          !document.documentElement.hasAttribute('data-lw-assistant-brand-hidden')
        const pairs = [
          ['.lw-brand-mark', '.lw-hero-avatar-img'],
          ['.lw-wordmark', '.lw-hero-entry-name'],
        ].flatMap(([from, to]) => {
          const bounds = animate && button.querySelector(from)?.getBoundingClientRect()
          return bounds?.width && bounds.height ? [{ bounds, to }] : []
        })
        assistantEntrance = { pairs, expires: performance.now() + 4000 }
      }

      function playAssistantEntrance(hero, entrance) {
        const layer = document.createElement('div')
        layer.className = 'lw-assistant-flight'
        layer.setAttribute('aria-hidden', 'true')
        document.body.append(layer)
        const animations = []
        const timing = { duration: 420, delay: 100, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
        for (const { bounds, to } of entrance.pairs) {
          const target = hero.querySelector(to)
          const end = target?.getBoundingClientRect()
          if (!end?.width || !end.height) continue
          const copy = target.cloneNode(true)
          const style = getComputedStyle(target)
          Object.assign(copy.style, {
            position: 'absolute', margin: '0', left: end.left + 'px', top: end.top + 'px',
            width: end.width + 'px', height: end.height + 'px',
            color: style.color, font: style.font, letterSpacing: style.letterSpacing,
            borderRadius: style.borderRadius, objectFit: style.objectFit,
          })
          layer.append(copy)
          const x = bounds.left + bounds.width / 2 - end.left - end.width / 2
          const y = bounds.top + bounds.height / 2 - end.top - end.height / 2
          const scale = bounds.height / end.height
          animations.push(copy.animate([
            { transform: "translate(" + x + "px," + y + "px) scale(" + scale + ")", opacity: 1 },
            { transform: 'none', opacity: 1, offset: .88 },
            { transform: 'none', opacity: 0 },
          ], timing))
          animations.push(target.animate([{ opacity: 0 }, { opacity: 0, offset: .88 }, { opacity: 1 }], timing))
        }
        const cleanup = () => {
          for (const animation of animations) animation.cancel()
          layer.remove()
        }
        Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup)
        return cleanup
      }

      function AssistantIdentity({ row, active = false, entryRef }) {
        const displayName = row?.name || 'Weave'
        const hasCustomAvatar = Boolean(row?.hasCustomAvatar && row?.avatar)
        const avatarSrc = hasCustomAvatar ? row.avatar : './weave-orbit.svg'
        const tagline = !active && row?.tagline
        return h('button', {
          ref: entryRef, type: 'button',
          className: 'lw-assistant-identity ' + (active ? 'lw-active-profile-entry' : 'lw-hero-profile-entry'),
          'aria-label': '设置全局助手 ' + displayName + ' 资料',
          'aria-haspopup': 'dialog', title: LW('点击设置助手头像与资料'),
          onClick: () => window.dispatchEvent(new CustomEvent(openProfileEvent)),
        },
          h('span', { className: 'lw-hero-avatar-frame', 'data-custom': hasCustomAvatar ? 'true' : 'false' },
            h('img', { src: avatarSrc, alt: '', 'aria-hidden': true, draggable: false, className: 'lw-brand-mark lw-hero-avatar-img' }),
            h('span', { className: 'lw-hero-avatar-badge', 'aria-hidden': true }, h(Icon, { name: 'edit' }))),
          h('span', { className: 'lw-hero-entry-name' }, displayName),
          tagline && h('span', { className: 'lw-hero-entry-tagline' }, tagline))
      }

      function GlobalHeroEntry({ size }) {
        useNav()
        useStore(ctx.sessions.list)
        useStore(ctx.workspaces.list)
        const panel = useStore(ctx.layout.panelInfo)
        const ref = React.useRef(null)
        const cleanup = React.useRef(null)
        const room = currentRow()
        React.useLayoutEffect(() => {
          if (!assistantEntrance || !ref.current?.getClientRects().length ||
              room?.scope !== 'global' || panel.activePanelId != null) return
          const entrance = assistantEntrance
          assistantEntrance = null
          setAssistantBrandHidden(true)
          if (performance.now() >= entrance.expires || !entrance.pairs.length ||
              matchMedia('(prefers-reduced-motion: reduce)').matches) return
          cleanup.current?.()
          cleanup.current = playAssistantEntrance(ref.current, entrance)
        })
        React.useLayoutEffect(() => () => cleanup.current?.(), [])
        if (room && room.scope !== 'global') return h(BrandMark, { size })
        return h(AssistantIdentity, { row: globalRow(), entryRef: ref })
      }
      slot('sidebar.brand.mark', { priority: -30 }, BrandMark)
      slot('conversation.hero.brand.mark', { priority: -30 }, GlobalHeroEntry)
      slot('conversation.hero.frame', { id: 'pixel-whale', priority: -30 }, ({ children }) => children)
      slot('conversation.hero.agentPreset', { priority: -30 }, () => null)
      slot('conversation.session.header.actions', { id: 'agent-preset', priority: -30, order: -10 }, () => null)
      slot('plugins.add.actions', { id: 'create-plugin', priority: -30 }, () => null)
      slot('conversation.hero.workspace', { id: 'labweave-assistant-workspace', priority: -30 }, function AssistantWorkspace({ selectedId }) {
        useNav()
        const workspaces = useStore(ctx.workspaces.list)
        const sessions = useStore(ctx.sessions.list)
        const panel = useStore(ctx.layout.panelInfo)
        const workspaceId = globalRow()?.workspaceId
        const canOpen = selectedId === undefined && panel.activePanelId == null &&
          workspaces.phase === 'ready' && sessions.phase === 'ready' &&
          workspaces.items.some(item => item.workspaceId === workspaceId)
        const [failed, setFailed] = React.useState(false)
        const [attempt, retry] = React.useReducer(n => n + 1, 0)
        React.useEffect(() => {
          if (!canOpen) return
          let cancelled = false
          nav.openWorkspace(workspaceId).catch(() => { if (!cancelled) setFailed(true) })
          return () => { cancelled = true }
        }, [canOpen, workspaceId, attempt])
        if (selectedId !== undefined) return null
        return h('div', { role: failed ? 'alert' : 'status', className: 'lw-hint' },
          failed ? LW('无法打开助手。') : LW('正在打开助手…'),
          failed && Btn({ variant: 'ghost', onClick: () => { setFailed(false); retry() } }, LW('重试')))
      })
      function showWelcome() {
        assistantEntrance = null
        closeDrawer()
        forgetPage()
        ctx.layout.selectPanel(welcomeKey)
        changed()
      }
      function toggleAssistant(button) {
        initialNavigation = true
        const g = globalRow()
        const current = currentSession()
        const panelId = ctx.layout.panelInfo.getSnapshot().activePanelId
        if (isAssistantOpen(panelId, current)) {
          foldedAssistantId = current.id
          showWelcome()
          return
        }
        const folded = panelId === welcomeKey && ctx.sessions.list.getSnapshot().byId[foldedAssistantId]
        const resume = folded && currentRow(folded)?.scope === 'global' ? folded : null
        foldedAssistantId = null
        if (!resume || resume.blank) queueAssistantEntrance(button)
        closeDrawer()
        if (resume) return openChat(resume.id)
        forgetPage()
        if (g) nav.startSession(g.workspaceId)
        else nav.startSession()
        changed()
      }
      function isAssistantOpen(panelId, session) {
        return panelId == null && session && currentRow(session)?.scope === 'global' && !allBotSessionIds().has(session.id)
      }
      slot('sidebar.brand.name', { priority: -30 }, () => {
        useNav()
        const ref = React.useRef(null)
        const panel = useStore(ctx.layout.panelInfo)
        useStore(ctx.sessions.list)
        useStore(ctx.workspaces.list)
        const active = Boolean(isAssistantOpen(panel.activePanelId, currentSession()))
        const label = active ? LW('收回助手') : LW('打开助手')
        React.useLayoutEffect(() => {
          const btn = ref.current?.closest('button')
          if (!btn) return
          btn.setAttribute('aria-label', label)
          btn.setAttribute('aria-expanded', String(active))
          btn.removeAttribute('title')
          const onClick = event => {
            event.preventDefault()
            event.stopPropagation()
            toggleAssistant(btn)
          }
          btn.addEventListener('click', onClick)
          return () => btn.removeEventListener('click', onClick)
        }, [label, active])
        return h('span', { ref, className: 'lw-brand-entry' },
          h('span', { className: 'lw-wordmark' }, 'Weave'),
          h('span', { className: 'lw-brand-assistant', 'data-active': active ? 'true' : 'false', 'aria-hidden': true }, label))
      })

      const tool = (name, label, onClick, className = '') => h('button', { type: 'button',
        className: className ? 'lw-tool ' + className : 'lw-tool', 'aria-label': label, title: label, onClick }, h(Icon, { name }))
      function closeDrawer() {
        if (document.querySelector('[data-sidebar-drawer]:not([data-sidebar-collapsed])')) ctx.layout.toggleSidebar()
      }
      function openPage(row, feature) {
        if (feature === 'chat') {
          const workspaces = ctx.workspaces.list.getSnapshot()
          const sessions = ctx.sessions.list.getSnapshot()
          const blank = sessionsFor(row.workspaceId, workspaces, sessions, allBotSessionIds())
            .find(session => session.blank && !session.running)
          if (!blank) return startProjectChat(row)
          if (currentSession()?.id !== blank.id || ctx.layout.panelInfo.getSnapshot().activePanelId !== null || chatSplit) return jump(blank.id)
          return closeDrawer()
        }
        selectPage(row.workspaceId, feature); closeDrawer()
      }
      function startProjectChat(row) { forgetPage(); nav.startSession(row.workspaceId); closeDrawer(); changed() }
      function jump(id) { openChat(id); closeDrawer() }

      function ProjectBranch({ row, sessions, activePage, current, filter, onRenameChat, onDeleteChat, onRenameFeature, onDeleteFeature }) {
        const { value, error } = useProject(row.workspaceId, 'navigation')
        const [chatsOpen, setChatsOpen] = React.useState(true)
        const featureList = projectFeatures(row, value)
        const archivedBots = featureList.filter(bot => bot.archived)
        const labels = value?.labels || Object.fromEntries(featureList.map(f => [f.id, f.label]))
        const hidden = allBotSessionIds(value)
        const visibleSessions = sessions.filter(s => !hidden.has(s.id))
        const matches = visibleSessions.filter(s => !filter || chatTitle(s).toLocaleLowerCase().includes(filter))
        const entry = (id, text, icon, click, active, extra = {}) => h('button', { type: 'button', className: 'lw-row-main',
          'aria-current': active ? 'page' : undefined, ...extra, onClick: click }, h(Icon, { name: icon }), h('span', null, text))
        return h('nav', { className: 'lw-tier', 'aria-label': row.name + LW(' 项目功能') },
          featureList.filter(bot => !bot.archived && !bot.clusterParent).map(feat => {
            const id = feat.id
            const label = labels[id] || feat.label || features[id] || id
            const members = featureList.filter(bot => bot.clusterParent === id && !bot.archived)
            return h(React.Fragment, { key: id },
              h('div', { className: 'lw-row' }, entry(id, label, botDisplayIcon(feat), () => {
                if (id === 'chat') {
                  if (matches.length > 0) setChatsOpen(prev => !prev)
                  else setChatsOpen(true)
                  return openPage(row, id)
                }
                openPage(row, id)
              }, activePage === id || splitPanes.some(p => p.workspaceId === row.workspaceId && p.feature === id),
              {
                ...(id === 'chat' && matches.length > 0 ? { 'aria-expanded': chatsOpen, title: chatsOpen ? LW('点击收起对话历史') : LW('点击展开对话历史') } : {}),
                ...(id !== 'chat' && paradigmKeyFor(feat) ? { 'data-paradigm': paradigmKeyFor(feat), style: { '--lw-paradigm-accent': paradigmAccentFor(feat) } } : {}),
              }),
              h('span', { className: 'lw-row-tools' },
                id === 'chat' && tool('plus', LW('在') + row.name + LW('中新建对话'), () => { setChatsOpen(true); startProjectChat(row) }),
                onRenameFeature && tool('edit', LW('重命名功能 ') + label, () => onRenameFeature(row, feat, label)),
                id!=='chat' && onDeleteFeature && tool('trash',LW('删除功能 ')+label,()=>onDeleteFeature(row,feat,label),'lw-tool-danger'),
                tool('split', LW('分屏打开') + label, () => splitPage(row, id)))),
              members.length > 0 && h('details', { className: 'lw-sessions' },
                h('summary', null, LW('成员 Bot') + ' · ' + members.length),
                members.map(member => h('div', { className: 'lw-row', key: member.id },
                  entry(member.id, member.label, botDisplayIcon(member),
                    () => openPage(row, member.id), activePage === member.id,
                    paradigmKeyFor(member) ? { 'data-paradigm': paradigmKeyFor(member), style: { '--lw-paradigm-accent': paradigmAccentFor(member) } } : {})))),
              id === 'chat' && (chatsOpen || Boolean(filter)) && matches.length > 0 && h('div', { className: 'lw-sessions', 'aria-label': row.name + LW(' 对话') },
                matches.map(s => h('div', { className: 'lw-row', key: s.id },
                  h('button', { type: 'button', className: 'lw-row-main', 'aria-current': current === s.id ? 'page' : undefined,
                    onClick: () => jump(s.id) }, h('span', null, chatTitle(s))),
                  h('span', { className: 'lw-row-tools' },
                    tool('edit', LW('重命名对话 ') + chatTitle(s), () => onRenameChat(s)),
                    tool('trash', LW('删除对话 ') + chatTitle(s), () => onDeleteChat(row, s), 'lw-tool-danger'))))))
          }),
          archivedBots.length > 0 && h('details', { className: 'lw-sessions' },
            h('summary', null, LW('已归档 Bot') + ' · ' + archivedBots.length),
            archivedBots.map(bot => h('div', { className: 'lw-row', key: bot.id },
              entry(bot.id, bot.label, botDisplayIcon(bot), () => openPage(row, bot.id), activePage === bot.id,
                paradigmKeyFor(bot) ? { 'data-paradigm': paradigmKeyFor(bot), style: { '--lw-paradigm-accent': paradigmAccentFor(bot) } } : {}),
              tool('back', LW('恢复 ') + bot.label, async () => {
                try {
                  await project(row.workspaceId, 'bot_restore', { featureId: bot.id })
                  await refresh()
                  window.dispatchEvent(new Event(updated))
                } catch (failure) { notice(failure.message) }
              })))),
          error && h('small', { role: 'alert' }, error))
      }

      const renameSessionById = async (sessionId, title) => {
        const result = await ctx.sessions.using(sessionId, { source: 'workspaceOperation' }, ref => ref.binding.session.rename(title))
        if (result && result.ok === false) throw Error(result.error?.message || LW('重命名对话失败。'))
      }
      const removeSessionInRow = async (row, sessionId) => {
        await api('delete-session', { sessionId })
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
          return h(Dialog, { title: LW('重命名对话'), close }, h('form', {
            className: 'lw-form',
            onSubmit: async e => {
              e.preventDefault(); if (busy || !title.trim()) return
              setBusy(true); setErr('')
              try { await renameSessionById(dialog.session.id, title.trim()); onCancel() }
              catch (error) { setErr(error.message); setBusy(false) }
            },
          },
          h('label', null, LW('对话标题'), h('input', { required: true, autoFocus: true, value: title, maxLength: 120, onChange: e => setTitle(e.target.value) })),
          err && h('p', { role: 'alert' }, err),
          h('div', { className: 'lw-actions lw-dialog-actions' },
            Btn({ variant: 'ghost', onClick: close, disabled: busy }, LW('取消')),
            Btn({ variant: 'primary', type: 'submit', disabled: busy || !title.trim() }, LW('保存')))))
        }
        if (dialog?.type === 'delete-session') {
          return h(Dialog, { title: LW('删除对话'), close }, h('div', { className: 'lw-form' },
            h('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } },
              `确定删除对话「${chatTitle(dialog.session)}」吗？对话日志将在 Weave 停止时永久清理。`),
            err && h('p', { role: 'alert' }, err),
            h('div', { className: 'lw-actions lw-dialog-actions' },
              Btn({ variant: 'ghost', onClick: close, disabled: busy }, LW('取消')),
              Btn({ variant: 'danger', disabled: busy, onClick: async () => {
                setBusy(true); setErr('')
                try { await removeSessionInRow(dialog.row, dialog.session.id); onCancel() }
                catch (error) { setErr(error.message); setBusy(false) }
              } }, busy ? LW('删除中…') : LW('确认删除')))))
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
          if (choice && choice.feature !== 'chat' && rows.some(r => r.workspaceId === choice.workspaceId)) {
            initialNavigation = true
            return selectPage(choice.workspaceId, choice.feature)
          }
          const room = currentRow(current)
          if (panel.activePanelId == null && !room) return
          initialNavigation = true
          if (panel.activePanelId == null && room?.scope === 'global' && current.blank) showWelcome()
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
          dialog?.type==='delete-bot' && h(Dialog,{title:LW('删除功能 Bot'),close},h('div',{className:'lw-form'},
            h('p',null,LW('从「')+dialog.row.name+LW('」移除「')+dialog.label+LW('」并撤销分配给它的任务？项目文件和已有记录会保留。')),
            err&&h('p',{role:'alert'},err),h('div',{className:'lw-actions lw-dialog-actions'},
              Btn({variant:'ghost',disabled:busy,onClick:close},LW('取消')),
              Btn({variant:'danger',disabled:busy,onClick:async()=>{
                if(busy)return
                setBusy(true);setErr('')
                try {
                  await project(dialog.row.workspaceId,'remove_feature_bot',{featureId:dialog.featureId})
                  await refresh()
                  if(splitPanes.some(p=>p.workspaceId===dialog.row.workspaceId&&p.feature===dialog.featureId))closePane({workspaceId:dialog.row.workspaceId,feature:dialog.featureId})
                  window.dispatchEvent(new Event(updated));setDialog(undefined)
                }catch(e){setErr(e.message)}finally{setBusy(false)}
              }},busy?LW('删除中…'):LW('确认删除'))))),
          dialog?.type === 'create-bot' && h(CreateFeatureBot,{row:dialog.row,close,created:async(row,feat)=>{
            await refresh();window.dispatchEvent(new Event(updated));setDialog(undefined)
            setExpanded(prev=>({...prev,[row.workspaceId]:true}));setFilter(null);openPage(row,feat.id)
          }}),
          dialog?.type === 'create' && h(ProjectForm, { refresh, onCreated: created, onCancel: close, pickDirectory: () => nav.pickDirectory() }),
          dialog?.type === 'rename' && h(Dialog, { title: LW('重命名项目'), close }, h('form', { className: 'lw-form',
            onSubmit: async e => {
              e.preventDefault(); if (busy || !rename.trim()) return
              setBusy(true); setErr('')
              try { await ctx.workspaces.rename(dialog.row.workspaceId, rename); setBusy(false); setDialog(undefined) }
              catch (error) { setErr(error.message); setBusy(false) }
            } },
            h('label', null, LW('项目名称'), h('input', { required: true, autoFocus: true, value: rename, maxLength: 80, onChange: e => setRename(e.target.value) })),
            err && h('p', { role: 'alert' }, err),
            h('div', { className: 'lw-actions lw-dialog-actions' },
              Btn({ variant: 'ghost', onClick: close, disabled: busy }, LW('取消')),
              Btn({ variant: 'primary', type: 'submit', disabled: busy || !rename.trim() }, LW('保存'))))),
          dialog?.type === 'delete-project' && h(DeleteProjectDialog, { row: dialog.row, removeProject, onCancel: close, onDeleted: close }),
          (dialog?.type === 'rename-session' || dialog?.type === 'delete-session') && h(SessionActionDialog, { dialog, onCancel: close }),
          dialog?.type === 'rename-feature' && h(FeatureRenameDialog, {
            workspaceId: dialog.row.workspaceId, projectName: dialog.row.name,
            featureId: dialog.featureId, currentLabel: dialog.label,
            onSaved: refresh, onCancel: close,
          }),
          dialog?.type === 'project-settings' && h(ProjectSettingsDialog, {
            key: dialog.row.workspaceId, row: dialog.row, close, refresh, removeProject, pickDirectory: () => nav.pickDirectory(),
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
            h('nav', { ref: railRef, className: 'lw-rail', 'aria-label': LW('工作区项目快捷栏') },
              !projectRows.length
                ? h('button', {
                    type: 'button', className: 'lw-rail-btn', 'aria-label': LW('工作区项目'), title: LW('工作区项目'),
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
                type: 'button', className: 'lw-rail-btn', 'aria-label': createWorkspaceProject, title: createWorkspaceProject,
                onClick: () => { setFlyout(null); setDialog({ type: 'create' }) },
              }, h(Icon, { name: 'plus' }))),
            flyout && ReactDOM.createPortal(
              h('div', {
                ref: flyoutRef, className: 'lw-rail-popover', role: 'dialog',
                'aria-label': flyRow ? flyRow.name + LW(' 项目菜单') : LW('工作区项目菜单'),
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
                      tool('plus', LW('在')+flyRow.name+LW('创建功能 Bot'), () => {setFlyout(null);setDialog({type:'create-bot',row:flyRow})}),
                      tool('gear', LW('项目设置 ') + flyRow.name, () => { setFlyout(null); setDialog({ type: 'project-settings', row: flyRow }) }),
                      tool('edit', LW('重命名') + flyRow.name, () => { setFlyout(null); setRename(flyRow.name); setDialog({ type: 'rename', row: flyRow }) }),
                      tool('trash', LW('删除') + flyRow.name, () => { setFlyout(null); setDialog({ type: 'delete-project', row: flyRow }) }, 'lw-tool-danger'),
                      tool('close', LW('关闭菜单'), () => setFlyout(null)))),
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
                      h('strong', null, LW('工作区项目')),
                      tool('close', LW('关闭菜单'), () => setFlyout(null))),
                    Btn({ variant: 'primary', size: 'sm', onClick: () => { setFlyout(null); setDialog({ type: 'create' }) } }, createWorkspaceProject),
                    Btn({ variant: 'ghost', size: 'sm', onClick: () => { setFlyout(null); nav.startSession() } }, LW('回到全局助手 ') + (globalRow()?.name || 'Weave')))),
              document.body),
            dialogs)
        }
        return h('section', { className: 'lw-tree', 'aria-label': LW('工作区') },
          h('header', { className: 'lw-tree-head' }, h('span', null, LW('工作区')),
            tool('search', LW('搜索项目和对话'), () => setFilter(filter === null ? '' : null)),
            tool('plus', createWorkspaceProject, () => setDialog({ type: 'create' }))),
          filter !== null && h('label', { className: 'lw-query' }, h('input', { type: 'search', autoFocus: true,
            'aria-label': LW('搜索项目和对话'), placeholder: LW('搜索项目和对话'), value: filter, onChange: e => setFilter(e.target.value) })),
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
              h('span', { className: 'lw-row-tools' },
                tool('plus', LW('在')+row.name+LW('创建功能 Bot'),()=>setDialog({type:'create-bot',row})),
                tool('gear', LW('项目设置 ') + row.name, () => setDialog({ type: 'project-settings', row }))),
              open && h('span', { className: 'lw-row-tools' },
                tool('edit', LW('重命名') + row.name, () => { setRename(row.name); setDialog({ type: 'rename', row }) }),
                tool('trash', LW('删除') + row.name, () => setDialog({ type: 'delete-project', row }), 'lw-tool-danger'))),
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
            type: 'button', className: 'lw-sidebar-empty-btn lw-add-action',
            onClick: () => setDialog({ type: 'create' }),
          }, h(Icon, { name: 'plus' }), h('span', null, LW('新建第一个工作区项目'))),
          dialogs)
      }
      slot('sidebar.workspaces', { priority: -25 }, ResearchTree)

      function ProjectMapDrawer({ row, value, close }) {
        const rails = value?.rails || {}
        const featureList = projectFeatures(row, value).filter(f => f.id !== 'chat')
        const jumpRail = rail => { close(); openPage(row, rail) }
        return h('section', { style: { display: 'grid', gap: 12 }, 'aria-label': LW('课题关系总览') },
          h('div', { className: 'lw-map-lanes' },
            featureList.map(feat => {
              const rail = feat.id
              const list = rails[rail] || []
              return h('div', { key: rail, className: 'lw-map-lane' },
                h('button', { type: 'button', className: 'lw-map-lane-btn', style: { fontWeight: 600, display: 'flex', justifyContent: 'space-between' },
                  onClick: () => jumpRail(rail) }, h('span', null, feat.label), h('span', { className: 'lw-num lw-hint' }, list.length)),
                !list.length ? h('span', { className: 'lw-hint', style: { padding: '2px 6px' } }, LW('暂无条目'))
                  : list.slice(-4).reverse().map((item, idx) => h('button', { key: item.id || idx, type: 'button', className: 'lw-map-lane-btn',
                    title: item.text, onClick: () => jumpRail(rail) }, item.text)))
            })),
          h('div', { className: 'lw-actions', style: { justifyContent: 'flex-end' } },
            Btn({ variant: 'secondary', size: 'sm', onClick: close }, LW('关闭'))))
      }

      const featureHints = {
        feed: LW('订阅并追踪前沿动态'),
        ideas: LW('把灵感转化为目标'),
        goals: LW('追踪里程碑和实验'),
        library: LW('文献、仓库和产物'),
      }
      const featureEmpties = {
        feed: LW('还没有收到任何动态推送'),
        ideas: LW('还没有收集任何点子'),
        goals: LW('还没有设定任何目标'),
        library: LW('还没有收录任何资源'),
      }

      function sessionErrorText(error) {
        if (!error) return ''
        if (error.code === 'session/writer-held') return ctx.locale.translate('conversation', 'error.sessionInUse')
        if (error.code === 'INTERRUPTED') return ctx.locale.translate('chat', 'message.failure.interrupted')
        return error.message || ''
      }

      function featureBotMessageText(ev) {
        const raw = ev?.data?.message?.content ?? ev?.data?.content ?? []
        return Array.isArray(raw)
          ? raw.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n')
          : (typeof raw === 'string' ? raw : '')
      }

      function isInjectedContextEvent(ev) {
        const source = ev?.data?.source ?? ev?.data?.message?.source
        const kind = typeof source?.kind === 'string' ? source.kind : ''
        if (kind && kind !== 'user') return true
        const text = featureBotMessageText(ev).trim()
        return text.startsWith('<system-reminder>') || text.startsWith('Time sampled while preparing turn')
      }

      function reconcileBotPrompts(pending, messages, sessionId) {
        if (!pending.length) return pending
        const acknowledged = new Map()
        return pending.flatMap(prompt => {
          if (prompt.sessionId !== sessionId) return [prompt]
          const afterSeq = Math.max(prompt.afterSeq, acknowledged.get(prompt.text) || 0)
          const echoed = messages.find(message => message.role === 'user' && message.seq > afterSeq && message.text === prompt.text)
          if (echoed) {
            acknowledged.set(prompt.text, echoed.seq)
            return []
          }
          return [afterSeq === prompt.afterSeq ? prompt : { ...prompt, afterSeq }]
        })
      }

      function useFeatureBot(row, feature, featMeta, value) {
        const sid = featMeta?.botSessionId && ctx.sessions.list.getSnapshot().byId[featMeta.botSessionId]
          ? featMeta.botSessionId : null
        const [eventsState, setEventsState] = React.useState({ messages: [], pending: [], running: false, progress: null, error: '' })
        const [sending, setSending] = React.useState(false)
        const createdSession = React.useRef(null)
        const submitting = React.useRef(false)

        React.useEffect(() => {
          if (!sid) {
            setEventsState(prev => ({ ...prev, messages: [], running: false, progress: null, error: '' }))
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
            const cuts = rewindCuts(entries.map(record => record.event))
            const messages = []
            let newestToolSeq = lastToolSeq
            for (const rec of entries) {
              const ev = rec?.event
              if (!ev || isRewound(cuts, ev.seq)) continue
              if (ev.type === 'user/message') {
                if (ev.data?.source?.kind === 'labweave-speaker') {
                  messages.push({ id: 's-' + ev.seq, role: 'speaker', label: ev.data.source.label, text: featureBotMessageText(ev) })
                  continue
                }
                if (isInjectedContextEvent(ev)) continue
                const text = featureBotMessageText(ev)
                if (text.trim()) messages.push({ id: 'u-' + ev.seq, role: 'user', seq: ev.seq, text: text.trim(), time: ev.time })
              } else if (ev.type === 'assistant/message') {
                const raw = ev.data?.message?.content ?? []
                const text = Array.isArray(raw) ? raw.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n') : ''
                if (text.trim()) messages.push({ id: 'a-' + ev.seq, role: 'assistant', seq: ev.seq, text: text.trim(), time: ev.time })
              } else if (ev.type === 'tool/result') {
                newestToolSeq = Math.max(newestToolSeq, ev.seq)
              }
            }
            if (newestToolSeq > lastToolSeq) {
              lastToolSeq = newestToolSeq
              window.dispatchEvent(new Event(updated))
              refresh().catch(() => {})
            }
            const running = Boolean(sessSnap?.running)
            const progress = running ? conversationProgress(entries) : null
            const errMsg = sessionErrorText(sessSnap?.promptError?.error) || sessionErrorText(sessSnap?.lastAgentError)
            setEventsState(prev => ({ messages, running, progress, error: errMsg,
              pending: reconcileBotPrompts(prev.pending, messages, sid) }))
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
              if (!disposed) setEventsState(prev => ({ ...prev, error: err?.message || LW('Bot 会话加载失败。') }))
            })
          } catch (err) {
            setEventsState(prev => ({ ...prev, error: err?.message || LW('Bot 会话不可用。') }))
          }
          return () => {
            disposed = true
            offs.forEach(fn => fn?.())
            try { ref?.release?.() } catch {}
          }
        }, [sid])

        const ensureSession = async () => {
          if (sid) return sid
          if (!createdSession.current) {
            createdSession.current = (async () => {
              const createdId = await ctx.sessions.create({ workspaceId: row.workspaceId })
              localBotSessions.add(createdId)
              await project(row.workspaceId, 'bot_session', { featureId: feature, sessionId: createdId })
              await refresh()
              window.dispatchEvent(new Event(updated))
              return createdId
            })().catch(error => { createdSession.current = null; throw error })
          }
          return createdSession.current
        }

        const sendPrompt = async text => {
          const clean = String(text || '').trim()
          if (!clean || submitting.current) return
          submitting.current = true
          const id = 'pending-' + requestId()
          const message = { id, role: 'user', text: clean, time: new Date().toISOString(), pending: true }
          setSending(true)
          setEventsState(prev => ({ ...prev, error: '', pending: [...prev.pending, message] }))
          try {
            const targetSid = await ensureSession()
            await ctx.sessions.using(targetSid, { source: 'featureBot' }, async ref => {
              await Promise.resolve(ref.ready).catch(() => {})
              await ensureSessionRoutableModel(targetSid, ref)
              const entries = ref.binding.eventSource.getSnapshot().entries || []
              const afterSeq = entries.reduce((latest, record) => Math.max(latest, record.event?.seq || 0), 0)
              setEventsState(prev => ({ ...prev, pending: prev.pending.map(prompt =>
                prompt.id === id ? { ...prompt, sessionId: targetSid, afterSeq } : prompt) }))
              const res = await ref.binding.session.prompt([{ type: 'text', text: clean }], 'queue')
              if (res && res.ok === false) throw Error(sessionErrorText(res.error) || LW('发送失败，请检查模型设置。'))
            })
          } catch (err) {
            setEventsState(prev => ({ ...prev, pending: prev.pending.filter(prompt => prompt.id !== id),
              error: err?.message || LW('发送失败。') }))
            throw err
          } finally {
            submitting.current = false
            setSending(false)
          }
        }

        return { ...eventsState, messages: [...eventsState.messages, ...eventsState.pending],
          sessionId: sid, sending, sendPrompt, ensureSession, openApproval: () => openChat(sid),
          openRewind: (message, restore) => openConversationRewind(sid, message.role, message.seq, restore) }
      }

      function ProjectPage({ row, feature, paneIndex = 0, paneCount = 1 }) {
        const { value, error: loadError } = useProject(row.workspaceId, 'view', '', 5000)
        const featureList = projectFeatures(row, value)
        const featMeta = featureList.find(f => f.id === feature) || { id: feature, label: features[feature] || feature }
        const { value: live } = useProject(row.workspaceId, 'bot_canvas', featMeta.paradigm ? feature : '', 1500)
        const labels = value?.labels || Object.fromEntries(featureList.map(f => [f.id, f.label]))
        const title = labels[feature] || featMeta.label || features[feature] || feature
        const pane = { workspaceId: row.workspaceId, feature }
        const subtitle = featMeta.hint || featureHints[feature] || value?.description || `${title}的分类推送`
        const emptyTitle = featMeta.emptyText || featureEmpties[feature] || `还没有收到来自「${title}」的推送内容`
        const persisted = paneStateFor(row.workspaceId, feature)
        const bot = useFeatureBot(row, feature, featMeta, value)
        return h('main', { className: 'lw-page', 'data-feature': feature, 'aria-label': row.name + '的' + title },
          h('div', { className: 'lw-page-topbar' },
            h('div', { className: 'lw-actions' },
              paneIndex === 0 && h('button', {
                type: 'button', className: 'lw-companion-btn', 'aria-pressed': !!chatSplit,
                'aria-label': chatSplit ? LW('收起项目聊天') : LW('展开项目聊天'),
                title: chatSplit ? LW('收起左侧项目聊天') : LW('在侧栏与主区之间展开项目聊天'),
                onClick: () => toggleCompanionChat(row),
              }, h(Icon, { name: 'chat' }), h('span', null, chatSplit ? LW('收起聊天') : LW('聊天')))),
            h('div', { className: 'lw-actions' },
              paneCount > 1 && h('button', {
                type: 'button', className: 'lw-pane-close',
                'aria-label': LW('关闭分栏 ') + title,
                title: LW('关闭分栏 ') + title,
                onClick: () => closePane(pane),
              }, h(Icon, { name: 'close' })))),
          h(Panel, {
            workspaceId: row.workspaceId, row, feature, featMeta, title, subtitle, emptyTitle,
            value, loadError, persisted, bot, live, openModels: () => openSettingsRef?.('models'), draft, onRenamed: refresh,
          }))
      }

      slot('main', { key: welcomeKey }, function Welcome() {
        const hour = new Date().getHours()
        const greeting = hour < 12 ? LW('早上好') : hour < 18 ? LW('下午好') : LW('晚上好')
        return h('main', { className: 'lw-welcome' },
          h(BrandMark, { size: 96 }), h('h1', null, greeting))
      })
      slot('main', { key: pageKey }, () => {
        useNav()
        const activePanes = (splitPanes.length ? splitPanes : (choice ? [choice] : []))
          .map(p => ({ ...p, row: rows.find(r => r.workspaceId === p.workspaceId && r.scope !== 'global') }))
          .filter(p => p.row && hasFeature(p.row, p.feature))
        if (!activePanes.length) return h('p', { className: 'lw-hint', style: { padding: 24 }, role: 'status' }, LW('请从侧栏选择项目。'))
        const paneCount = activePanes.length + (chatSplit ? 1 : 0)
        if (activePanes.length === 1) {
          const p = activePanes[0]
          return h(ProjectPage, { key: p.workspaceId + ':' + p.feature, row: p.row, feature: p.feature, paneIndex: 0, paneCount })
        }
        return h('div', { className: 'lw-split-grid', 'aria-label': LW('分屏工作区') },
          activePanes.map((p, idx) => h(ProjectPage, { key: p.workspaceId + ':' + p.feature, row: p.row, feature: p.feature, paneIndex: idx, paneCount })))
      })

      const ToolPane = React.lazy(() => import(new URL('./labweave-tools-panel.js', document.baseURI).href)
        .then(module => ({default: module.createToolPane(React, project, { Icon, Btn, useProject, fileUploadData, updated })})))
      const BrowserPane = React.lazy(() => import(new URL('./labweave-browser-panel.js', document.baseURI).href)
        .then(module => ({default: module.createBrowserPane(React, { LW })})))
      function isProjectChat(sid) {
        const session = currentSession()
        const row = currentRow(session)
        return !!sid && session?.id === sid && !!row && row.scope !== 'global'
          && ctx.layout.panelInfo.getSnapshot().activePanelId == null
          && !(chatSplit && splitPanes.length)
      }

      const guideGlyph = (path, name) => function GuideGlyph({ size = 24, className }) {
        return h('svg', {
          width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true, 'data-icon': name,
        }, h('path', { d: path }))
      }
      const guideArtwork = {
        storage: guideGlyph(paths.cube, 'cube'),
        git: guideGlyph(paths.repo),
        browser: guideGlyph('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z'),
      }

      const PROJECT_TOOL_TABS = [
        {
          id: 'labweave-project-files',
          kind: 'labweave-files',
          title: '空间存储',
          order: 5,
          guideIcon: guideArtwork.storage,
          description: '按时间查看和下载本项目对话生成的文件。',
        },
        {
          id: 'labweave-project-git',
          kind: 'labweave-git',
          title: 'Git',
          order: 12,
          guideIcon: guideArtwork.git,
          description: '查看本项目仓库和工作树的状态、变更和最近提交。',
        },
      ]
      function projectToolTab(kind) {
        return function ProjectToolTab() {
          useNav()
          useStore(ctx.sessions.list)
          useStore(ctx.workspaces.list)
          useStore(ctx.layout.panelInfo)
          const current = currentRow(), sid = currentSession()?.id
          if (!isProjectChat(sid) || allBotSessionIds().has(sid)) return null
          return h(React.Suspense, { fallback: h('p', { className: 'lw-hint', role: 'status' }, LW('正在打开工具…')) },
            h(ToolPane, { key: current.workspaceId + ':' + kind, row: current, kind }))
        }
      }
      function registerProjectToolTab(spec) {
        if (!ctx.sidebarRightTabs?.register) return
        const definition = {
          id: spec.id,
          kind: spec.kind,
          priority: spec.priority || 'builtin',
          title: () => LW(spec.title),
          guide: [{
            id: spec.guideId || spec.kind,
            order: spec.order,
            title: () => LW(spec.title),
            description: () => LW(spec.description),
            ...(spec.guideIcon ? { icon: spec.guideIcon } : {}),
            ...(spec.commandId ? { commandId: spec.commandId } : {}),
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
              const sid = currentSession()?.id
              if (isProjectChat(sid) && !allBotSessionIds().has(sid)) {
                if (!off) off = ctx.sidebarRightTabs.register(definition)
              } else if (off) {
                off()
                off = undefined
              }
            })
          }
          const subs = [ctx.layout.panelInfo,ctx.sessions.list,ctx.workspaces.list].map(store => store.subscribe(sync))
          window.addEventListener(navEvent,sync)
          sync()
          return () => { disposed=true; window.removeEventListener(navEvent,sync); subs.forEach(unsubscribe=>unsubscribe()); off?.() }
        }, 'LabWeave ' + spec.kind + ' visibility')
        slot('sidebar.right.pane.tab.title', { key: spec.id }, () => h('span',null,LW(spec.title)))
        slot('sidebar.right.pane.tab', { key: spec.id }, projectToolTab(spec.kind))
      }
      PROJECT_TOOL_TABS.forEach(registerProjectToolTab)

      if (ctx.sidebarRightTabs?.register) {
        const browserTabDef = {
          id: 'labweave-live-browser',
          kind: 'labweave-browser',
          priority: 'builtin',
          title: () => LW('浏览器'),
          guide: [{
            id: 'labweave-browser',
            order: 25,
            title: () => LW('浏览器'),
            description: () => LW('由本机真实浏览器内核驱动，支持任意网站、论文页面、PDF 与登录态。'),
            icon: guideArtwork.browser,
          }],
        }
        ctx.effect(() => ctx.sidebarRightTabs.register(browserTabDef), 'LabWeave live browser tab')
        slot('sidebar.right.pane.tab.title', { key: 'labweave-live-browser' }, () => h('span', null, LW('浏览器')))
        slot('sidebar.right.pane.tab', { key: 'labweave-live-browser' }, function LiveBrowserTab() {
          useNav()
          useStore(ctx.sessions.list)
          const sid = currentSession()?.id || 'global'
          return h(React.Suspense, { fallback: h('p', { className: 'lw-hint', role: 'status' }, LW('正在打开浏览器…')) },
            h(BrowserPane, { key: 'browser:' + sid, tabKey: sid }))
        })
      }

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
          assistantEntrance = null
          setOpen(false)
          forgetPage()
          nav.startSession(row.workspaceId)
          changed()
        }
        return h('div', { className: 'lw-corner-wrap' },
          h('button', {
            ref: triggerRef, type: 'button', className: 'lw-corner-btn',
            'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-label': LW('助手历史对话'),
            onClick: () => { if (!open) placePopover(); setOpen(prev => !prev) },
          }, h(Icon, { name: 'chat' }), h('span', null, LW('历史对话')), historyList.length > 0 && h('span', { className: 'lw-seg-count' }, historyList.length)),
          !current.blank && h('button', {
            type: 'button', className: 'lw-corner-btn lw-add-action', 'aria-label': LW('新建全局对话'),
            onClick: startNewGlobalSession,
          }, h(Icon, { name: 'plus' }), h('span', null, LW('新对话'))),
          open && ReactDOM.createPortal(
            h('div', {
              ref: popoverRef, className: 'lw-session-popover', role: 'dialog',
              'aria-label': LW('助手历史对话列表'),
              style: { top: pos.top, left: pos.left },
            },
            h('div', { className: 'lw-session-popover-head' },
              h('strong', null, LW('历史对话')),
              h('span', { className: 'lw-actions', style: { gap: 4 } },
                Btn({ variant: 'ghost', size: 'xs', className: 'lw-add-action', disabled: Boolean(current.blank), onClick: startNewGlobalSession },
                  h(Icon, { name: 'plus' }), LW('新对话')),
                tool('close', LW('关闭列表'), () => setOpen(false)))),
            h('div', { className: 'lw-session-popover-list' },
              !historyList.length
                ? h('p', { className: 'lw-hint', style: { padding: '12px 6px', margin: 0, textAlign: 'center' } }, LW('暂无历史对话，发送消息后会自动保存。'))
                : historyList.map(s => h('div', { className: 'lw-row', key: s.id },
                  h('button', {
                    type: 'button', className: 'lw-row-main',
                    'aria-current': current.id === s.id ? 'page' : undefined,
                    onClick: () => { setOpen(false); openChat(s.id) },
                  },
                  h('span', { className: 'lw-row-title' }, chatTitle(s)),
                  Boolean(s.updatedAt) && h('span', { className: 'lw-row-time' }, fmtDate(s.updatedAt))),
                  h('span', { className: 'lw-row-tools' },
                    tool('edit', LW('重命名对话 ') + chatTitle(s), () => { setOpen(false); setSessionDialog({ type: 'rename-session', row, session: s }) }),
                    tool('trash', LW('删除对话 ') + chatTitle(s), () => { setOpen(false); setSessionDialog({ type: 'delete-session', row, session: s }) }, 'lw-tool-danger')))))),
            document.body),
          sessionDialog && h(SessionActionDialog, { dialog: sessionDialog, onCancel: () => setSessionDialog(null) }))
      })

      const dispatchStatuses = {
        queued: ['待启动', 'neutral'], running: ['执行中', 'neutral'], completed: ['已完成', 'success'],
        blocked: ['受阻', 'warning'], needs_follow_up: ['待跟进', 'warning'], incomplete: ['未完成', 'warning'],
        failed: ['失败', 'danger'], cancelled: ['已取消', 'neutral'], interrupted: ['已中断', 'warning'],
      }

      function ProjectDispatchCard({ task, row, close }) {
        const [expanded, setExpanded] = React.useState(false)
        const [detail, setDetail] = React.useState(null)
        const [error, setError] = React.useState(false)
        const [attempt, retry] = React.useReducer(n => n + 1, 0)
        React.useEffect(() => {
          if (!expanded) return
          const controller = new AbortController()
          project(row.workspaceId, 'bot_dispatch_detail', { id: task.id }, controller.signal).then(value => {
            if (!controller.signal.aborted) { setDetail(value); setError(false) }
          }).catch(() => { if (!controller.signal.aborted) setError(true) })
          return () => controller.abort()
        }, [expanded, row.workspaceId, task.id, task.updatedAt, attempt])
        const [status, tone] = dispatchStatuses[task.status] || [task.status, 'neutral']
        const origin = sessionsFor(row.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot())
          .find(session => session.id === task.parentSessionId)
        const affiliation = [task.clusterLabel && task.botLabel,
          task.botState === 'archived' ? LW('Bot 已归档') : task.botState === 'removed' ? LW('Bot 已移除') : '',
          fmtDateTime(task.updatedAt)].filter(Boolean).join(' · ')
        return h('details', { className: 'lw-project-task-item', onToggle: e => setExpanded(e.currentTarget.open) },
          h('summary', null, h(Icon, { name: 'right' }),
            h('span', { className: 'lw-project-task-title' },
              h('strong', null, task.title || task.task.split('\n')[0].slice(0, 110)),
              h('span', { className: 'lw-hint' }, affiliation)),
            h(Tag, { tone }, LW(status))),
          expanded && h('div', { className: 'lw-project-task-detail' },
            error && h('div', { role: 'alert', className: 'lw-actions' }, LW('任务详情暂时无法读取。'),
              Btn({ variant: 'ghost', size: 'xs', onClick: () => { setError(false); retry() } }, LW('重试'))),
            !detail && !error && h('p', { className: 'lw-hint', role: 'status' }, LW('正在读取任务详情…')),
            detail && h(React.Fragment, null,
              h('small', { className: 'lw-hint' }, LW('分派于 ') + fmtDateTime(detail.createdAt)),
              h('p', null, detail.task),
              detail.answer && h(Markdown, { source: detail.answer }),
              detail.detail && h('p', { className: 'lw-hint' }, detail.detail)),
            h('div', { className: 'lw-actions' },
              origin && Btn({ variant: 'secondary', size: 'xs', onClick: () => { close(); openChat(origin.id) } }, LW('返回发起对话')),
              task.botState !== 'removed' && Btn({ variant: 'secondary', size: 'xs',
                onClick: () => { close(); openPage(row, task.featureId) } }, LW('查看 Bot')))))
      }

      function ProjectTasks({ row, sessionId }) {
        const { workspaceId, features: bots } = row
        const [open, setOpen] = React.useState(false)
        const [section, setSection] = React.useState('dispatch')
        const [dispatches, setDispatches] = React.useState(null)
        const [activeCount, setActiveCount] = React.useState(0)
        const [schedules, setSchedules] = React.useState(null)
        const [error, setError] = React.useState(false)
        const [attempt, retry] = React.useReducer(n => n + 1, 0)
        React.useEffect(() => {
          const controller = new AbortController()
          const { signal } = controller
          let timer, reading = false
          const readSchedules = open && section === 'schedules'
          const read = async () => {
            if (reading || signal.aborted) return
            clearTimeout(timer)
            reading = true
            try {
              if (document.hidden) return
              if (readSchedules) {
                const groups = await Promise.all((bots || []).filter(bot => bot.id !== 'chat').map(async bot => {
                  const assignments = await project(workspaceId, 'bot_assignments', { featureId: bot.id }, signal)
                  return assignments.filter(task => task.kind === 'schedule').map(task => ({ ...task, botLabel: bot.label }))
                }))
                if (!signal.aborted) setSchedules([...new Map(groups.flat().map(task => [task.id, task])).values()])
              } else {
                const data = await project(workspaceId, 'bot_dispatches', { summary: !open }, signal)
                if (signal.aborted) return
                setActiveCount(data.activeCount)
                if (open) setDispatches(data.tasks)
              }
              if (!signal.aborted) setError(false)
            } catch {
              if (!signal.aborted) setError(true)
            } finally {
              reading = false
              if (!signal.aborted && !readSchedules) timer = setTimeout(read, open ? 1500 : 5000)
            }
          }
          const offChanged = readSchedules && remoteBus?.$on?.('schedule/changed', read)
          const offReset = ctx.on('connection/reset', read)
          window.addEventListener('focus', read)
          read()
          return () => {
            controller.abort()
            clearTimeout(timer)
            if (offChanged) offChanged()
            offReset()
            window.removeEventListener('focus', read)
          }
        }, [workspaceId, bots, remoteBus, attempt, open, section])

        const label = LW('项目任务')
        const close = () => setOpen(false)
        const groups = new Map()
        for (const task of dispatches || []) {
          const id = task.clusterId || task.featureId
          if (!groups.has(id)) groups.set(id, { label: task.clusterLabel || task.botLabel, tasks: [] })
          groups.get(id).tasks.push(task)
        }
        let content
        if (section === 'dispatch') {
          content = groups.size ? [...groups].map(([id, group]) => h('section', { key: id, className: 'lw-project-task-group' },
            h('h3', null, group.label),
            group.tasks.map(task => h(ProjectDispatchCard, { key: task.id, task, row, close }))))
            : h('p', { className: 'lw-hint', role: 'status' }, dispatches ? LW('本项目还没有分派给 Bot 的任务。') : LW('正在读取分派任务…'))
        } else if (!schedules?.length) {
          content = h('p', { className: 'lw-hint', role: 'status' }, schedules ? LW('本项目的 Bot 暂无定时任务。') : LW('正在读取定时任务…'))
        } else {
          content = h('ul', { className: 'lw-project-task-list', role: 'list' }, schedules.map(task => {
            const next = task.next ? LW('下次执行 ') + fmtDateTime(task.next) : ''
            const details = [task.botLabel, scheduleStatusText[task.status], next].filter(Boolean).join(' · ')
            return h('li', { key: task.id }, h('button', {
              type: 'button', className: 'lw-more',
              onClick: () => {
                close()
                ctx.sidebarRight.openTab('scheduleTask', { params: { sessionId, id: task.id } })
              },
            }, h('strong', null, task.title), h('span', { className: 'lw-hist-muted' }, details)))
          }))
        }
        return h(React.Fragment, null,
          h('button', {
            type: 'button', className: 'lw-corner-btn', title: label,
            'aria-label': label, 'aria-haspopup': 'dialog', 'aria-expanded': open,
            'aria-description': activeCount ? `${activeCount} 项任务执行中或待启动` : undefined,
            onClick: () => { setSection('dispatch'); setError(false); setOpen(true) },
          }, h(Icon, { name: 'calendar' }), h('span', { className: 'lw-corner-label' }, label),
          activeCount > 0 && h('span', { className: 'lw-seg-count', 'aria-hidden': true }, activeCount)),
          open && ReactDOM.createPortal(h(Dialog, { title: label, close, side: true },
            h('div', { className: 'lw-project-task-content' },
              h('nav', { className: 'lw-segmented', 'aria-label': LW('项目任务栏目') },
                [['dispatch', 'Bot 分派'], ['schedules', '定时任务']].map(([id, text]) =>
                  h('button', { key: id, type: 'button', className: 'lw-seg-btn', 'aria-pressed': section === id,
                    onClick: () => { setError(false); setSection(id) } }, LW(text)))),
              error && h('div', { className: 'lw-actions', role: 'alert' }, LW('读取项目任务失败。'),
                Btn({ variant: 'ghost', size: 'xs', onClick: () => { setError(false); retry() } }, LW('重试'))),
              content)), document.body))
      }

      slot('conversation.session.header.corner', { id: 'labweave-rightbar-picker', priority: -20 }, () => {
        useNav()
        const sessions = useStore(ctx.sessions.list)
        useStore(ctx.workspaces.list)
        const current = Object.values(sessions.byId).find(s => s.retainedBy.mainView > 0)
        const sid = current?.id
        const row = currentRow()
        const isGlobal = !row || row.scope === 'global'
        const panel = useStore(ctx.layout.panelInfo)
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
        if (!sid) return null
        if (isGlobal) {
          if (!row || current.blank || panel.activePanelId != null) return null
          return h(AssistantIdentity, { row, active: true })
        }
        return h('div', { className: 'lw-corner-wrap lw-project-corner' },
          panel.activePanelId == null && !allBotSessionIds().has(sid) && h(ProjectTasks, { key: sid, row, sessionId: sid }),
          h('button', {
            type: 'button', className: 'lw-corner-btn', title: LW('工具'),
            'aria-expanded': rightOpen, 'aria-label': LW('工具'),
            onClick: toggleRightbar,
          }, h(Icon, { name: 'sidebarRight' }), h('span', { className: 'lw-corner-label' }, LW('工具'))))
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
      const mutatedNsCache = new Map()
      const writePathLocal = (root, path, value) => {
        if (!path?.length) return value
        const base = root && typeof root === 'object' && !Array.isArray(root) ? { ...root } : {}
        const [head, ...rest] = path
        base[head] = writePathLocal(base[head], rest, value)
        return base
      }

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
          for (const [nsName, cached] of mutatedNsCache.entries()) {
            const live = namespaces.get(nsName)
            const liveRev = typeof live?.revision === 'number' ? live.revision : -1
            const cachedRev = typeof cached?.revision === 'number' ? cached.revision : -1
            if (!live || cachedRev > liveRev) {
              if (cached) namespaces.set(nsName, cached)
            } else {
              mutatedNsCache.delete(nsName)
            }
          }
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
          const onUpd = () => {
            void loadMeta()
            void dir?.load?.().catch(() => {})
          }
          window.addEventListener('labweave:model-updated', onUpd)
          return () => window.removeEventListener('labweave:model-updated', onUpd)
        }, [loadMeta, dir])

        React.useEffect(() => {
          if (current?.provider && current?.model) lastModelByProvider.set(current.provider, current.model)
        }, [current?.provider, current?.model])

        const switchPane = next => {
          rootRef.current?.focus({ preventScroll: true })
          setErrorText('')
          setSubPane(next)
        }

        const currentGroup = groups.find(g => g.id === current?.provider) || null
        const currentModelObj = currentGroup?.models?.find(m => m.id === current?.model) || null
        const currentProvMeta = meta.providers.find(p => p.provider === current?.provider) || null
        const provDisplayName = currentProvMeta?.displayName
          || (current?.provider === 'deepseek-account' ? LW('DeepSeek 账号') : currentGroup?.name)
          || current?.provider || LW('未选择')

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
          ? (formatModelCapacity(effectiveContextWindow) + (isContextOverridden ? '' : LW(' 默认')))
          : LW('默认')

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
            const liveNsView = mirror?.view?.namespaces?.find(n => n.ns === currentProvMeta.settingsNs)
            const cachedNsView = mutatedNsCache.get(currentProvMeta.settingsNs)
            const nsView = (cachedNsView && (!liveNsView || (Number(cachedNsView.revision) || 0) > (Number(liveNsView.revision) || 0)))
              ? cachedNsView
              : liveNsView
            if (!nsView) throw Error(LW('当前供应商不支持在线改写模型参数。'))
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
            if (!res?.ok) throw Error(res?.error?.message || LW('保存模型参数失败。'))
            const hasFullView = res.value && typeof res.value === 'object' && ('value' in res.value || 'user' in res.value)
            const patchedView = hasFullView
              ? { ...nsView, ...res.value, ns: nsView.ns }
              : {
                  ...nsView,
                  revision: typeof res.value?.revision === 'number' ? res.value.revision : ((Number(nsView.revision) || 0) + 1),
                  value: writePathLocal(nsView.value, mpath, nextList),
                  user: ops[0]?.path ? writePathLocal(nsView.user, ops[0].path, ops[0].value) : nsView.user,
                }
            mutatedNsCache.set(nsView.ns, patchedView)
            await describe.ensure().catch(() => {})
            const expectsReasoning = Object.prototype.hasOwnProperty.call(patch, 'reasoningEfforts') ? Boolean(patch.reasoningEfforts) : undefined
            const expectsCtx = typeof patch.contextWindow === 'number' ? patch.contextWindow : undefined
            for (let attempt = 0; attempt < 20; attempt++) {
              await dir?.load?.().catch(() => {})
              const reloaded = dir?.store?.getSnapshot?.()?.groups
                ?.find(g => g.id === current.provider)?.models?.find(m => m.id === current.model)
              const rOk = expectsReasoning === undefined || Boolean(reloaded?.reasoning) === expectsReasoning
              const cOk = expectsCtx === undefined || reloaded?.contextWindow === expectsCtx
              if (rOk && cOk) break
              await new Promise(r => setTimeout(r, 120))
            }
            await syncModelCatalogAndSessions()
            await loadMeta()
            return true
          } catch (err) {
            const msg = err?.message || LW('保存失败。')
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
            if (res && res.ok === false) throw Error(res.error?.message || LW('切换供应商模型失败。'))
            lastModelByProvider.set(group.id, target.id)
            window.dispatchEvent(new Event('labweave:model-updated'))
            switchPane('root')
          } catch (err) {
            const msg = err?.message || LW('切换供应商失败。')
            setErrorText(msg)
            reportFailure?.(msg)
          } finally {
            setBusy(false)
          }
        }

        return h('div', { ref: rootRef, className: 'lw-mo-root', tabIndex: -1 },
          subPane === 'root' && h(React.Fragment, null,
            canConfigCustomReasoning && h('button', {
              type: 'button', role: 'menuitem', className: 'lw-mo-cell', disabled: busy || locked,
              onClick: () => switchPane('reasoning'),
            },
              h('span', { className: 'lw-mo-cell-label' }, LW('推理强度')),
              h('span', { className: 'lw-mo-cell-val' }, configuredEntry?.reasoningEfforts ? LW('已配置') : LW('默认（关闭）')),
              h(Icon, { name: 'right' })),
            current?.model && h('button', {
              type: 'button', role: 'menuitem', className: 'lw-mo-cell', disabled: busy || locked,
              onClick: () => { setCustomCtx(''); switchPane('context') },
            },
              h('span', { className: 'lw-mo-cell-label' }, LW('上下文窗口')),
              h('span', { className: 'lw-mo-cell-val' }, contextLabel),
              h(Icon, { name: 'right' })),
            errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText)),

          subPane === 'context' && h('div', { className: 'lw-mo-sub lw-mo-context', role: 'group', 'aria-label': LW('上下文窗口长度') },
            h('div', { className: 'lw-mo-subhead' },
              h('button', { type: 'button', className: 'lw-mo-back', onClick: () => switchPane('root') },
                h(Icon, { name: 'back' }), h('span', null, LW('上下文窗口')))),
            !canMutateSettings
              ? h('p', { className: 'lw-hint', style: { margin: '6px 8px', fontSize: 12 } }, LW('当前模型配置为只读或由账号托管，无法修改上下文窗口。'))
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
                }, h('span', null, LW('恢复模型默认'))),
                h('form', {
                  className: 'lw-mo-custom',
                  onSubmit: async e => {
                    e.preventDefault()
                    const parsed = parseModelCapacity(customCtx)
                    if (!Number.isInteger(parsed) || parsed <= 0) {
                      setErrorText(LW('请输入正整数（可带 K 或 M，例如 200K 或 131072）'))
                      return
                    }
                    if (await applyModelConfigPatch({ contextWindow: parsed })) { setCustomCtx(''); switchPane('root') }
                  },
                },
                  h('input', {
                    type: 'text', inputMode: 'numeric', 'aria-label': LW('自定义上下文窗口长度'),
                    placeholder: LW('自定义，如 200K / 131072'), value: customCtx, disabled: busy || locked,
                    onChange: e => { setCustomCtx(e.target.value); setErrorText('') },
                  }),
                  Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy || locked || !customCtx.trim() }, LW('应用'))),
                errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText))),

          subPane === 'reasoning' && h('div', { className: 'lw-mo-sub', role: 'group', 'aria-label': LW('模型推理强度配置') },
            h('div', { className: 'lw-mo-subhead' },
              h('button', { type: 'button', className: 'lw-mo-back', onClick: () => switchPane('root') },
                h(Icon, { name: 'back' }), h('span', null, LW('启用推理强度')))),
            h('p', { className: 'lw-hint', style: { margin: '4px 8px', fontSize: 12 } },
              LW('为该自定义/第三方模型启用标准推理档位，启用后可直接在上方「推理等级」中切换。')),
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
              h('span', null, LW('启用（Off / Low / Medium / High）')),
              h(Icon, { name: 'check' })),
            errorText && h('div', { className: 'lw-mo-err', role: 'alert' }, errorText))
        )
      }
      slot('conversation.input.model.options', { id: 'labweave-model-controls', order: 10 }, ModelOptionsSlot)

      function nativeModelSubpane(menu) {
        if (!menu || menu.querySelector('.lw-mo-root')) return null
        if (menu.getAttribute('role') === 'group') return 'model'
        const hasDrill = [...menu.querySelectorAll('[role="menuitem"]')].some(el => {
          const label = el.querySelector('[class*="cellLabel"], .lw-mo-cell-label')
          const textContent = (label || el).textContent || ''
          return /^(模型|推理等级|推理强度|上下文窗口)/.test(textContent.trim())
        })
        if (hasDrill) return null
        if (menu.querySelector('[role="searchbox"]')) return 'model'
        if (menu.querySelector('[role="menuitemradio"]')) return 'effort'
        return null
      }
      function ModelMenuNativeBack() {
        const [pane, setPane] = React.useState(null)
        React.useEffect(() => {
          const sync = () => {
            const menus = document.querySelectorAll('[role="menu"][aria-label="模型与推理等级"], [role="group"][aria-label="模型与推理等级"]')
            for (const menu of menus) {
              const kind = nativeModelSubpane(menu)
              if (!kind || !menu.getClientRects().length) continue
              setPane(prev => prev?.menu === menu && prev.kind === kind ? prev : { menu, kind })
              return
            }
            setPane(null)
          }
          const observer = new MutationObserver(sync)
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-label'] })
          sync()
          return () => observer.disconnect()
        }, [])
        if (!pane) return null
        const { menu, kind } = pane
        const title = kind === 'model' ? LW('模型') : LW('推理等级')
        return ReactDOM.createPortal(
          h('div', { className: 'lw-mo-subhead lw-mo-native-back' },
            h('button', {
              type: 'button', className: 'lw-mo-back',
              onMouseDown: event => event.preventDefault(),
              // Follow the native submenu's Escape handling and focus restoration.
              onClick: () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })),
            }, h(Icon, { name: 'back' }), h('span', null, title))),
          menu)
      }

      function AssistantSettingsSection() {
        const [pref, setPref] = React.useState(null)
        const [choices, setChoices] = React.useState([])
        const [savingModel, setSavingModel] = React.useState(false)
        const [modelError, setModelError] = React.useState('')
        const [permission, setPermission] = React.useState(null)
        const [savingPermission, setSavingPermission] = React.useState(false)
        const [permissionError, setPermissionError] = React.useState('')
        React.useEffect(() => {
          const controller = new AbortController()
          api('assistant-permission', undefined, controller.signal).then(setPermission).catch(err => {
            if (!controller.signal.aborted) setPermissionError(err.message)
          })
          return () => controller.abort()
        }, [])
        async function applyPermission(preset) {
          setSavingPermission(true)
          setPermissionError('')
          try { setPermission(await api('assistant-permission', { preset })) }
          catch (error) { setPermissionError(error.message) }
          finally { setSavingPermission(false) }
        }
        React.useEffect(() => {
          const controller = new AbortController()
          migrateAssistantModel.then(() => api('assistant-model', undefined, controller.signal)).then(data => {
            setChoices(data.models)
            setPref(data.preference || { mode: 'auto' })
          }).catch(error => { if (!controller.signal.aborted) setModelError(error.message) })
          return () => controller.abort()
        }, [])
        async function apply(preference) {
          setSavingModel(true)
          setModelError('')
          try {
            const data = await api('assistant-model', { preference })
            setChoices(data.models)
            setPref(data.preference)
          } catch (error) { setModelError(error.message) }
          finally { setSavingModel(false) }
        }
        const routeValue = choice => JSON.stringify([choice.provider, choice.model])
        const selected = pref?.provider && pref?.model ? routeValue(pref) : ''
        const active = choices.find(choice => routeValue(choice) === selected)
        const modelDefaults = {
          reasoningEffort: active?.efforts.some(item => item.id === pref?.reasoningEffort) ? pref.reasoningEffort : null,
          contextWindow: active?.contextOptions.includes(pref?.contextWindow) ? pref.contextWindow : null,
        }
        return h('section', { className: 'lw-asst-settings', 'aria-label': LW('助手设置') },
          h('header', { className: 'lw-asst-settings-head' },
            h('h2', null, LW('助手模型')),
            h('p', { className: 'lw-hint' }, LW('设置全局助手每轮使用的模型、推理强度和上下文窗口。'))),
          h('div', { className: 'lw-asst-choices', role: 'radiogroup', 'aria-label': LW('助手模型') },
            h('button', {
              type: 'button', role: 'radio', className: 'lw-asst-choice',
              disabled: !pref || savingModel,
              'data-selected': pref?.mode === 'auto' ? 'true' : 'false',
              'aria-checked': pref?.mode === 'auto',
              onClick: () => void apply({ ...pref, mode: 'auto' }),
            }, h('strong', null, LW('智能选择')), h('span', null, LW('根据任务复杂度和对话长度，在本地为每轮选择模型、推理强度和上下文窗口。'))),
            h('button', {
              type: 'button', role: 'radio', className: 'lw-asst-choice',
              disabled: !pref || savingModel || !choices.length,
              'data-selected': pref?.mode === 'fixed' ? 'true' : 'false',
              'aria-checked': pref?.mode === 'fixed',
              onClick: () => {
                const choice = active || choices[0]
                void apply({ provider: choice.provider, model: choice.model, ...modelDefaults, mode: 'fixed' })
              },
            }, h('strong', null, LW('固定模型')), h('span', null, LW('每轮使用你指定的模型、推理强度和上下文窗口。')))),
          modelError && h('p', { role: 'alert' }, modelError),
          pref?.mode === 'fixed' && h('label', { className: 'lw-asst-select' }, LW('使用的模型'),
            choices.length
              ? h(Select, {
                value: selected, disabled: savingModel, ariaLabel: LW('使用的模型'),
                onChange: next => {
                  const choice = choices.find(c => routeValue(c) === next)
                  if (choice) void apply({ mode: 'fixed', provider: choice.provider, model: choice.model })
                },
                options: [
                  ...(active ? [] : [{ value: selected, label: LW('已保存的模型当前不可用') }]),
                  ...choices.map(c => ({ value: routeValue(c), label: c.label })),
                ],
              })
              : h('p', { className: 'lw-hint' }, LW('还没有可调用的模型，请先添加 API。'))),
          pref?.mode === 'fixed' && active && h(React.Fragment, null,
            h('label', { className: 'lw-asst-select' }, LW('推理强度'),
              h(Select, {
                ariaLabel: LW('推理强度'), value: pref.reasoningEffort || '',
                disabled: savingModel || (!active.efforts.length && !pref.reasoningEffort),
                onChange: next => void apply({ ...pref, ...modelDefaults, reasoningEffort: next || null }),
                options: [
                  { value: '', label: active.efforts.length ? LW('模型默认') : LW('此模型未提供可选档位') },
                  ...(pref.reasoningEffort && !active.efforts.some(item => item.id === pref.reasoningEffort)
                    ? [{ value: pref.reasoningEffort, label: LW('已保存的档位当前不可用') }] : []),
                  ...active.efforts.map(item => ({ value: item.id, label: item.name })),
                ],
              })),
            h('label', { className: 'lw-asst-select' }, LW('上下文窗口'),
              h(Select, {
                ariaLabel: LW('上下文窗口'), value: pref.contextWindow || '',
                disabled: savingModel || (!active.contextOptions.length && !pref.contextWindow),
                onChange: next => void apply({ ...pref, ...modelDefaults, contextWindow: Number(next) || null }),
                options: [
                  { value: '', label: active.contextWindow ? LW('模型默认 ') + formatModelCapacity(active.contextWindow) : LW('模型默认') },
                  ...(pref.contextWindow && !active.contextOptions.includes(pref.contextWindow)
                    ? [{ value: pref.contextWindow, label: LW('已保存的窗口当前不可用') }] : []),
                  ...active.contextOptions.map(size => ({ value: size, label: formatModelCapacity(size) })),
                ],
              }))),
          h('label', { className: 'lw-asst-select' }, LW('助手权限'),
            h(Select, {
              value: permission?.preset || '', disabled: !permission || savingPermission, ariaLabel: LW('助手权限'),
              placeholder: permission ? LW('请选择助手权限') : LW('正在读取权限…'),
              onChange: next => void applyPermission(next),
              options: Object.entries(permissionLabels).filter(([value]) => permission?.options.includes(value))
                .map(([value, label]) => ({ value, label })),
            })),
          h('p', { className: 'lw-hint' }, LW('完全权限可直接转交。其他级别先确认。项目任务按目标项目会话的权限执行。')),
          permissionError && h('p', { role: 'alert' }, permissionError))
      }
      slot('settings.section', { id: 'labweave-assistant', order: 8, label: () => LW('助手设置') }, AssistantSettingsSection)
      slot('settings.launcher', { id: 'labweave-flat-footer', priority: -30 }, ({ wide, openSettings }) => {
        openSettingsRef = openSettings
        const items = [
          ['model', LW('模型与 API'), () => openSettings('models')],
          ['gear', LW('设置'), () => openSettings()],
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
          h('div', { className: 'lw-split-grid', 'aria-label': LW('分屏工作区') },
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
          h(ModelMenuNativeBack),
          splitPortal,
          error && h(Dialog, { title: LW('工作区'), close: () => setError('') }, h('p', { role: 'alert' }, error),
            Btn({ variant: 'secondary', onClick: () => setError('') }, LW('关闭'))),
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
    return { inject: ['slots', 'uiWorkspace', 'uiConversation', 'conversation', 'workspaces', 'sessions', 'layout',
      'locale', 'theme', 'configForms', 'sidebarRight', 'sidebarRightTabs'], apply: install }
  },
})
