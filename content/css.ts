const css = `
/* ig: Open in app */
._acc8._abpk,
/* reddit */
shreddit-ad-post,
shreddit-comments-page-ad,
/* threads: Open in app */
.x6s0dn4.x78zum5.xdt5ytf.x1mk1bxn.xaw7rza.xvc5jky,
/* x: Upgrade */
[data-testid="super-upsell-UpsellButtonRenderProperties"],
/* nora */
._nora_hidden_ {
  display: none !important;
}
`

export function injectCSS() {
  const style = document.createElement('style')
  style.type = 'text/css'
  style.textContent = css
  document.head.appendChild(style)
}
