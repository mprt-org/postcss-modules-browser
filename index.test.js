const postcss = require('postcss')

const plugin = require('./')

async function run(input, output, opts = {}, from='/style.css') {
  let result = await postcss([plugin(opts)]).process(input, { from })
  expect(result.css).toEqual(output)
  expect(result.warnings()).toHaveLength(0)
}

async function fail(input, error, opts, from='/style.css') {
  await expect(postcss([plugin(opts)]).process(input, { from })).rejects.toThrowError(error)
}

it('throws on non-absolute file name', async () => {
  await fail('.a { }', 'File name should be absolute!', {}, 'http://example.com/style.css')
})

it('replace simple class', async () => {
  await run('.a { }', '._style_css-a { }')
})

it('sanitize filename', async () => {
  await run('.a { }', '._styles_the_style_css-a { }', {}, '/styles/the style.css')
})

it('don\'t replace global class', async () => {
  await run(':global(.a) { }', '.a { }')
})

it('replace class in multiselector', async () => {
  await run('html, .a, .b { }', 'html,._style_css-a,._style_css-b { }')
})

it('don\'t replace global class in multiselector', async () => {
  await run('html, :global(.a), .b { }', 'html,.a,._style_css-b { }')
})

it('don\'t replace global classes in multiselector', async () => {
  await run('html, :global(.a, .b, .c) { }', 'html,.a, .b, .c { }')
})

it('removes :global pseudo everywhere', async () => {
  await run(':global(.a) :global :global(html) :global(#root) :global-1 { }', '.a  html #root :global-1 { }')
})

it('exports camelCase', async () => {
  const json = {}
  await run('.class-dash, .classCamel { }', '._style_css-class-dash,._style_css-classCamel { }', {json})
  expect(json).toEqual({
    'class-dash': '_style_css-class-dash',
    'classDash': '_style_css-class-dash',
    'classCamel': '_style_css-classCamel',
  })
})

it('don\'t override already exists camelCase exports', async () => {
  const json = {}
  await run('.classDash, .class-dash { }', '._style_css-classDash,._style_css-class-dash { }', {json})
  expect(json).toEqual({
    'class-dash': '_style_css-class-dash',
    'classDash': '_style_css-classDash',
  })
})

it('don\'t exports globals', async () => {
  const json = {}
  await run(':global(.a) { }', '.a { }', {json})
  expect(json).toEqual({})
})

it('use custom name generator', async () => {
  const nameGenerator = (file, cls) => cls + '__in__' + file.replace(/[/.]/g, '_')
  await run('.class { }', '.class__in___style_css { }', {nameGenerator})
})

it('throws at wrong class names', async () => {
  const nameGenerator = (file, cls) => '--' + cls
  await fail(
    '.class { }',
    `Wrong generated name for class "class" in /style.css\nGot: "--class"\nLook at https://stackoverflow.com/a/449000/5576420`,
    {nameGenerator}
  )
})

it('replace local keyframes name', async () => {
  await run('@keyframes a { }', '@keyframes _style_css-a { }')
})

it('exports local keyframes name', async () => {
  const json = {}
  await run('@keyframes a { }', '@keyframes _style_css-a { }', {json})
  expect(json).toEqual({a: '_style_css-a'})
})

it('don\'t replace global keyframes name', async () => {
  await run('@keyframes :global(a) { }', '@keyframes a { }')
})

it('don\'t exports global keyframes name', async () => {
  const json = {}
  await run('@keyframes :global(a) { }', '@keyframes a { }', {json})
  expect(json).toEqual({})
})

it('replace local keyframes name in animation-name', async () => {
  await run('@keyframes a { } html {animation-name: a}', '@keyframes _style_css-a { } html {animation-name: _style_css-a}')
  await run('@keyframes a { } html {animation-name: "a"}', '@keyframes _style_css-a { } html {animation-name: _style_css-a}')
})

it('replace local keyframes name in animation', async () => {
  await run('@keyframes a { } html {animation: 0.5s a}', '@keyframes _style_css-a { } html {animation: 0.5s _style_css-a}')
  await run('@keyframes a { } html {animation: 0.5s "a"}', '@keyframes _style_css-a { } html {animation: 0.5s _style_css-a}')
})

it('replace local keyframes name with same name as in class', async () => {
  await run(
    '@keyframes pulse { } .pulse {animation: pulse 2s infinite; animation-name: pulse;}',
    '@keyframes _style_css-pulse { } ._style_css-pulse {animation: _style_css-pulse 2s infinite; animation-name: _style_css-pulse;}'
  )
  await run(
    '.pulse {animation: pulse 2s infinite; animation-name: pulse;} @keyframes pulse { }',
    '._style_css-pulse {animation: _style_css-pulse 2s infinite; animation-name: _style_css-pulse;} @keyframes _style_css-pulse { }'
  )
})

it('don\'t replace global keyframes name in animation-name', async () => {
  await run('@keyframes :global(a) { } html {animation-name: a}', '@keyframes a { } html {animation-name: a}')
  await run('html {animation-name: a}', 'html {animation-name: a}')
  await run('html {animation-name: "a"}', 'html {animation-name: "a"}')
})

it('don\'t replace global keyframes name in animation', async () => {
  await run('@keyframes :global(a) { } html {animation: 0.5s a}', '@keyframes a { } html {animation: 0.5s a}')
  await run('html {animation: 0.5s a}', 'html {animation: 0.5s a}')
  await run('html {animation: 0.5s "a"}', 'html {animation: 0.5s "a"}')
})

it('composes classes', async () => {
  const json = {}
  await run('.class1 { } .class2 {composes: class1;}', '._style_css-class1 { } ._style_css-class2 {}', {json})
  expect(json).toEqual({
    'class1': '_style_css-class1',
    'class2': '_style_css-class2 _style_css-class1',
  })
})

it('throw on wrong composes', async () => {
  await fail('.class1 { } .class2 .class3 {composes: class1;}', /.*/)
  await fail('.class1 { } :global(.class2) {composes: class1;}', /.*/)
  await fail('.class2 {composes: class1;}', 'Malformed composes: has no such local class to compose from: class1')
  await fail('.class1 {composes: class1;}', 'Malformed composes: class composes itself: class1')
})

it('composes classes from global', async () => {
  const json = {}
  await run('.class1 {composes: class1 from global;}', '._style_css-class1 {}', {json})
  expect(json).toEqual({
    'class1': '_style_css-class1 class1',
  })
})

it('composes classes from file', async () => {
  const json = {}
  await run('.class2 {composes: class1 from "/css/the file.css";}', '._style_css-class2 {}', {json})
  expect(json).toEqual({
    'class2': '_style_css-class2 _css_the_file_css-class1',
  })
})

it('composes multiple local classes', async () => {
  const json = {}
  await run(
    '.class1 { } .class2 {} .class3 {} .class4 {composes: class1 class2 class3;}',
    '._style_css-class1 { } ._style_css-class2 {} ._style_css-class3 {} ._style_css-class4 {}',
    {json}
    )
  expect(json).toEqual({
    'class1': '_style_css-class1',
    'class2': '_style_css-class2',
    'class3': '_style_css-class3',
    'class4': '_style_css-class4 _style_css-class1 _style_css-class2 _style_css-class3',
  })
})

it('composes multiple classes from file', async () => {
  const json = {}
  await run(
    '.class4 {composes: class1 class2 class3 from "/css/file.css";}',
    '._style_css-class4 {}',
    {json}
  )
  expect(json).toEqual({
    'class4': '_style_css-class4 _css_file_css-class1 _css_file_css-class2 _css_file_css-class3',
  })
})

it('composes multiple global classes', async () => {
  const json = {}
  await run(
    '.class4 {composes: class1 class2 class3 from global;}',
    '._style_css-class4 {}',
    {json}
  )
  expect(json).toEqual({
    'class4': '_style_css-class4 class1 class2 class3',
  })
})

it('composes multiple statements', async () => {
  const json = {}
  await run(
    '.class1 { } .class2 {} .class4 {composes: class1; composes: class2; composes: class3 from global;}',
    '._style_css-class1 { } ._style_css-class2 {} ._style_css-class4 {}',
    {json}
  )
  expect(json).toEqual({
    'class1': '_style_css-class1',
    'class2': '_style_css-class2',
    'class4': '_style_css-class4 _style_css-class1 _style_css-class2 class3',
  })
})


  it('composes classes from relative file', async () => {
  const json = {}
  await run('.class2 {composes: class1 from "the file.css";}', '._css_style_css-class2 {}', {json}, "/css/style.css")
  expect(json).toEqual({
    'class2': '_css_style_css-class2 _css_the_file_css-class1',
  })
})
