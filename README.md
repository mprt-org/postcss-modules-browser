# PostCSS Modules Browser

[PostCSS] plugin to process CSS modules.

[PostCSS]: https://github.com/postcss/postcss

```css
/* Input example */
.foo {
}
```

```css
/* Output example */
._style_css-foo {
}
```

## Usage

**Step 1:** Install plugin:

```sh
npm install --save-dev postcss @mprt/postcss-modules-browser
```

**Step 2:** Check you project for existed PostCSS config: `postcss.config.js`
in the project root, `"postcss"` section in `package.json`
or `postcss` in bundle config.

If you do not use PostCSS, add it according to [official docs]
and set this plugin in settings.

**Step 3:** Add the plugin to plugins list:

```diff
module.exports = {
  plugins: [
+   require('@mprt/postcss-modules-browser'),
    require('autoprefixer')
  ]
}
```

[official docs]: https://github.com/postcss/postcss#usage
