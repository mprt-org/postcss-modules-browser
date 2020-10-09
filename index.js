const parser = require('postcss-selector-parser')
const path = require('path')

function hasGlobalParent(node) {
  while (node.parent) {
    node = node.parent
    if (node.type === parser.PSEUDO && node.value === ':global')
      return true
  }
  return false
}

const replaceLocalClasses = genName => selectors => {
  selectors.walkClasses(cls => {
    if (!hasGlobalParent(cls))
      cls.replaceWith(parser.className({value: genName(cls.value)}))
  });
  stripGlobal(selectors)
}

const stripGlobal = selectors => {
  selectors.walkPseudos(ps => {
    if (ps.value === ':global')
      ps.replaceWith(ps.nodes)
  })
}


const replaceLocalClassesInCompose = genName => selectors => {
  if (selectors.nodes.length > 1)
    throw new Error('Compose declaration should not contains commas')
  const tokens = selectors.nodes[0].nodes.filter(n => n.type === parser.TAG || n.type === parser.STRING)
  let isGlobal = false
  let file
  if (tokens.length > 2) {
    const prelast = tokens[tokens.length - 2]
    const last = tokens[tokens.length - 1]
    if (prelast.value === 'from') {
      if (last.type === parser.STRING) {
        file = stripQuotes(last.value)
        last.remove()
        tokens.pop()
      }
      else if (last.value === 'global') {
        isGlobal = true
        last.remove()
        tokens.pop()
      }
      else throw new Error('Malformed composes')
      prelast.remove()
      tokens.pop()
    }
  }
  if (tokens.some(t => t.type !== parser.TAG))
    throw new Error('Malformed composes')

  if (isGlobal)
    return

  for (const tag of tokens) {
    tag.value = genName(file, tag.value)
  }
}

function stripQuotes(str) {
  if (str[0] === '"' && str[str.length - 1] === '"')
    return str.substr(1,str.length - 2)
  return str
}

function camelize(str) {
  return str.replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
}

const defaultNameGenerator = (filename, className) => filename.replace(/[^_a-zA-Z0-9-]/g, '_') + '-' + className

const classNameRE = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/

const browserModulesPlugin = ({json={}, nameGenerator=defaultNameGenerator} = {}) => ({
  postcssPlugin: 'postcss-modules-browser',
  OnceExit(root) {
    const keyframes = {}
    const reversed = {}
    const filename = root.source.input.from
    if (!filename.startsWith('/'))
      throw new Error('File name should be absolute!')

    function genName(name, isKeyframe = false) {
      if (!json[name]) {
        const n = nameGenerator(filename, name)
        if (!n.match(classNameRE))
          throw new Error('Wrong generated name for ' + (isKeyframe ? 'keyframe' : 'class') + ' "' + name + '" in ' + filename
            + '\nGot: "' + n + '"'
            + '\nLook at https://stackoverflow.com/a/449000/5576420')
        json[name] = n
        reversed[n] = name
      }
      if (isKeyframe)
        keyframes[name] = json[name]
      return json[name]
    }

    root.walk(node => {
      if (node.type === "rule") {
        node.selector = parser(replaceLocalClasses(genName)).processSync(node.selector)
      }
      else if (node.type === "atrule" && node.name === 'keyframes') {
        if (!node.params.startsWith(':global')) {
          node.params = genName(node.params, true)
        } else {
          node.params = parser(stripGlobal).processSync(node.params)
        }
      }
    })
    root.walkDecls(decl => {
      if (decl.prop === 'animation-name') {
        const str = keyframes[stripQuotes(decl.value)]
        if (str)
          decl.value = str
      }
      if (decl.prop === 'animation') {
        let change = false
        const parts = decl.value.split(/\s+/).map(p => {
          const str = keyframes[stripQuotes(p)]
          if (str) {
            change = true
            return str
          }
          return p
        })
        if (change)
          decl.value = parts.join(' ')
      }
      if (decl.prop === 'composes') {
        const rule = decl.parent
        if (!rule || rule.type !== 'rule')
          throw new Error('Malformed composes: has no parent rule!')
        if (!rule.selector.startsWith('.'))
          throw new Error('Malformed composes: rule selector should be a class, but got: ' + rule.selector)
        const sel = rule.selector.slice(1)
        const originalClass = reversed[sel]
        if (!originalClass)
          throw new Error('Malformed composes: has no such local class: ' + originalClass)

        const cns = parser(replaceLocalClassesInCompose((file, cls) => {
          let res
          if (!file) {
            if (cls === originalClass)
              throw new Error('Malformed composes: class composes itself: ' + cls)
            res = json[cls]
            if (!res)
              throw new Error('Malformed composes: has no such local class to compose from: ' + cls)
          }
          else {
            const u = path.resolve(path.dirname(filename), file)
            res = nameGenerator(u, cls)
          }
          return res
        })).processSync(decl.value)
        json[originalClass] += ' ' + cns.trim()
        decl.remove()
      }
    })

    for (let [k, v] of Object.entries(json)) {
      const camel = camelize(k)
      if (!json[camel])
        json[camel] = v
    }
  }
})
browserModulesPlugin.postcss = true

module.exports = browserModulesPlugin
