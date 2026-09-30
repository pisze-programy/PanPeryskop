// These pages stand alone: their own deploy, the same design tokens.
const SITE_FONTS = `@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;src:url("/assets/fonts/inter-latin.woff2") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;src:url("/assets/fonts/inter-latin-ext.woff2") format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Instrument Serif";font-style:normal;font-weight:400;font-display:swap;src:url("/assets/fonts/instrument-serif.woff2") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Instrument Serif";font-style:normal;font-weight:400;font-display:swap;src:url("/assets/fonts/instrument-serif-latin-ext.woff2") format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
`;

export const SITE_CSS = `${SITE_FONTS}:root{--paper:#fff;--surface:#f3f3f3;--ink:#000c1f;--ink-soft:#000c1f;--navy:#002664;--muted:rgba(0,0,0,.55);--muted-strong:rgba(0,0,0,.68);--line:rgba(0,0,0,.10);--dark:#000c1f;--accent:#7a5cf0;--accent-deep:#4b2fb3;--link:#0a84ff;--brand-grad:linear-gradient(135deg,#2980a6,#332ba6,#9c29a6);--pill:999px;--radius:14px;--ease:cubic-bezier(.16,1,.3,1);--sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--serif:"Instrument Serif","Iowan Old Style",Georgia,Times,serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;overflow-x:hidden}
body{font-family:var(--sans);font-size:16px;line-height:1.65;letter-spacing:-.01em;margin:0 auto;padding:0 16px 44px;max-width:880px;background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;height:auto;display:block}
a{color:inherit;text-decoration:none}
ul,ol{list-style:none;margin:0;padding:0}
h1,h2,h3,h4{font-family:var(--serif);font-weight:400;letter-spacing:-.035em;line-height:1.05;text-wrap:balance}
h1{font-size:clamp(23px,5.4vw,33px);margin:20px 0 8px}
h2{font-size:clamp(18px,3.2vw,22px);margin:34px 0 10px}
h3{font-size:18px;margin:20px 0 6px}
h4{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-strong);margin:22px 0 8px}
p{margin:0 0 14px;max-width:68ch}
.muted{color:var(--muted-strong)}
.lead{font-size:16px;color:var(--muted-strong);margin:0 0 20px;max-width:64ch}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
:focus-visible{outline:2px solid var(--link);outline-offset:2px;border-radius:6px}
.site :focus-visible,.site-foot :focus-visible{outline-color:#fff}
.grad-text{background:var(--brand-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.plain{font-size:15px}
.plain li{padding:9px 0;border-bottom:1px solid var(--line)}
.plain li:last-child{border-bottom:0}
.plain a{font-weight:600;text-decoration:underline;text-decoration-color:rgba(0,0,0,.25);text-underline-offset:3px}
.plain a:hover{color:var(--accent-deep);text-decoration-color:currentColor}
.rows li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 14px;align-items:baseline;padding:11px 0}
.rows .muted{text-align:right}
.site{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:14px 0 22px;padding:13px 15px;border-radius:var(--radius);background:var(--dark);color:#fff}
.site .brand{display:inline-flex;align-items:center;font-size:16px;font-weight:700;letter-spacing:-.02em;color:#fff}
.site .crumb{font-size:13px;color:rgba(255,255,255,.55);text-decoration:underline;text-decoration-color:rgba(255,255,255,.3);text-underline-offset:3px}
.site .crumb:hover{color:#fff}
.btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;margin-left:auto;border-radius:var(--pill);background:#fff;color:var(--ink-soft);font-size:13px;font-weight:600;line-height:1;white-space:nowrap;transition:background-color .15s ease,transform .15s ease}
.btn:hover{background:#e8e8e3}
.btn:active{transform:scale(.97)}
.origins{display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:13px}
.origins li{padding:0;border:0}
.origins a{display:inline-flex;align-items:center;min-height:32px;padding:0 11px;border-radius:var(--pill);background:rgba(0,0,0,.05);font-weight:500;text-decoration:none}
.origins a:hover{background:rgba(122,92,240,.14);color:var(--accent-deep)}
.origins__label{font-size:12px;color:var(--muted-strong)}
.site nav.origins{flex:1 1 100%;margin-top:2px}
.site .origins a{background:rgba(255,255,255,.1);color:#fff;text-decoration:none}
.site .origins a:hover{background:rgba(255,255,255,.22);color:#fff}
.site .origins__label{color:rgba(255,255,255,.5)}
.site-foot{margin-top:44px;padding:20px 16px;border-radius:var(--radius);background:var(--dark);color:rgba(255,255,255,.6);font-size:13px}
.site-foot .plain li{border-bottom-color:rgba(255,255,255,.12)}
.site-foot .plain a{color:rgba(255,255,255,.75)}
.site-foot .plain a:hover{color:#fff}
.foot-links{margin:12px 0 0;font-size:13px}
.foot-links a{color:rgba(255,255,255,.6)}
.foot-links a:hover{color:#fff}
.foot{color:var(--muted-strong);font-size:12px;line-height:1.65;max-width:70ch}
.opt{position:relative;padding:15px 0 13px;border-bottom:1px solid var(--line)}
.opt:last-child{border-bottom:0}
.opt--best{margin:0 -12px;padding:15px 12px 13px;border-radius:12px;background:linear-gradient(90deg,rgba(122,92,240,.09),rgba(122,92,240,0))}
.opt__badge{display:inline-block;margin:0 0 9px;padding:3px 10px;border-radius:var(--pill);background:var(--accent-deep);color:#fff;font-size:11px;font-weight:700;letter-spacing:.02em}
.opt__head{display:flex;align-items:center;justify-content:space-between;gap:10px 14px;flex-wrap:wrap}
.opt__date{display:inline-flex;align-items:center;gap:8px;font-weight:600}
.opt__date:hover .cal{border-color:var(--accent)}
.cal{display:inline-flex;flex-direction:column;width:46px;flex:none;border:1px solid rgba(0,0,0,.14);border-radius:9px;overflow:hidden;text-align:center;background:#fff}
.cal__top{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:3px 0}
.cal__day{font-size:17px;font-weight:700;line-height:1.4;padding:1px 0 3px;background:#fff}
.cal__arrow{color:var(--muted-strong);font-weight:600;font-size:12px;margin:0 2px}
.opt__right{display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.opt__total{font-size:clamp(16px,4vw,18px);font-weight:700;letter-spacing:-.02em;white-space:nowrap}
.opt__nights{font-size:12px;color:var(--muted-strong)}
.opt__detail{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:14px}
.opt__line{display:flex;align-items:baseline;gap:10px;padding:3px 0}
.opt__ico{display:none}
.opt__lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;text-decoration:underline;text-decoration-color:rgba(0,0,0,.25);text-underline-offset:3px}
.opt__lbl:hover{color:var(--accent-deep);text-decoration-color:currentColor}
.opt__lbl.muted{text-decoration:none}
.opt__val{font-weight:700;white-space:nowrap;font-size:14px}
.opt__hotelmeta{margin:2px 0 0;font-size:12px;color:var(--muted-strong)}
.opt__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.opt__actions a{display:inline-flex;align-items:center;height:44px;padding:0 20px 2px;border-radius:40px;border:1px solid var(--line);background:#fff;font-size:14px;font-weight:500;letter-spacing:-.03em;transition:background-color .15s cubic-bezier(.4,0,.2,1),transform .1s cubic-bezier(.4,0,.2,1)}
.opt__actions a:active{transform:scale(.98)}
.opt__actions a:first-child{background:var(--navy);border-color:var(--navy);color:#fff}
.opt__actions a:first-child:hover{background:#3a238f;border-color:#3a238f}
.opt__actions a:not(:first-child):hover{border-color:var(--ink)}
.directions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 4px}
.directions a{display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:var(--pill);border:1px solid var(--line);background:#fff;font-size:13px;font-weight:600}
.directions a:hover{border-color:var(--ink)}
.hrow{display:flex;align-items:baseline;gap:10px}
.hrow a{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:rgba(0,0,0,.25);text-underline-offset:3px}
.hrow a:hover{color:var(--accent-deep)}
.hrrow-meta{padding-top:2px;border-bottom:1px solid var(--line);font-size:12px}
.acard a{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--line);border-radius:12px;background:#fff}
.acard a:hover{border-color:var(--accent)}
.acard__img{width:64px;height:64px;flex:none;border-radius:9px;overflow:hidden;background:rgba(0,0,0,.05)}
.acard__img img{width:100%;height:100%;object-fit:cover}
.acard__body{display:flex;flex-direction:column;gap:3px;min-width:0}
.acard__name{font-weight:600;font-size:14px}
.plain li.acard{padding:0;border-bottom:0;margin:8px 0}
.faq__q{font-size:16px;margin:22px 0 4px}
.faq__a{margin:0 0 6px;color:var(--muted-strong);font-size:15px}
.hero{width:100%;height:clamp(180px,42vw,300px);object-fit:cover;border-radius:var(--radius);margin:10px 0 22px}
@media(max-width:640px){
  body{padding:0 14px 36px}
  .site ul.origins{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
  .site ul.origins::-webkit-scrollbar{display:none}
  .opt--best{margin:0 -8px;padding-left:8px;padding-right:8px}
  .opt__right{align-items:flex-start}
  .rows li{grid-template-columns:1fr}
  .rows .muted{text-align:left}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001s!important;transition-duration:.001s!important}}`;

export const ORIGIN_CSS = `.place{display:grid;grid-template-columns:240px minmax(0,1fr);align-items:stretch;margin:16px 0;background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.place__img{position:relative;display:block;height:100%;min-height:200px;overflow:hidden;background:rgba(0,0,0,.05)}
.place__img img{width:100%;height:100%;object-fit:cover}
.place__ph{display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;padding:18px;text-align:center;font-size:19px;font-weight:700;letter-spacing:-.02em;color:#fff}
.credit{position:absolute;right:8px;bottom:6px;padding:2px 7px;border-radius:var(--pill);background:rgba(0,0,0,.55);color:rgba(255,255,255,.9);font-size:10px}
.place__body{padding:16px 18px 18px}
.place__body h3{margin:0 0 4px;font-size:21px}
.place__body h3 a{color:var(--ink)}
.place__body h3 a:hover{color:var(--accent-deep)}
.place__price{margin:0 0 10px;font-size:clamp(19px,4.4vw,23px);font-weight:700;letter-spacing:-.03em}
.place__note,.place__avg{display:block;font-size:12px;font-weight:400;letter-spacing:0;color:var(--muted-strong)}
.options{margin-top:4px}
.editorial{max-width:720px}
.partners{margin:34px 0 0}
.pcard{display:flex;align-items:center;gap:12px;margin:10px 0;padding:14px 16px;border:1px solid var(--line);border-radius:var(--radius)}
.pcard:hover{border-color:rgba(0,0,0,.2)}
.pcard__logo{width:40px;height:40px;flex:none;padding:5px;border-radius:10px;background:#fff;object-fit:contain;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.pcard__body{flex:1;display:flex;flex-direction:column;min-width:0}
.pcard__title{font-weight:600;font-size:15px}
.pcard__sub{font-size:12px;color:var(--muted-strong)}
.pcard__chev{font-size:18px;font-weight:700}
@media(max-width:640px){
  .place{grid-template-columns:1fr}
  .place__img{min-height:170px}
}`;

export const HUB_CSS = `.hub{margin:22px 0 0}
.hub ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.hub li{display:block;padding:0;border:0}
.hub a{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:0 16px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:15px;font-weight:600;text-decoration:none}
.hub a:hover{border-color:var(--accent);color:var(--accent-deep)}
.hub a::after{content:"\\2192";color:var(--accent-deep);font-weight:700}`;
