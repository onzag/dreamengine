// Shared CSS strings are loaded with the components, before their first render.

export const sharedStyles = `
/* Shadow roots do not inherit the app's scrollbar rules. */
* { box-sizing: border-box; }
*::-webkit-scrollbar { width: 12px; height: 12px; }
*::-webkit-scrollbar-track { background: rgba(100, 0, 200, .3); }
*::-webkit-scrollbar-thumb { background: rgba(50, 0, 100, .8); border: 1px solid #ccc; border-radius: 6px; }
*::-webkit-scrollbar-thumb:hover { background: rgba(70, 0, 140, .9); }
:host, :host * { text-shadow: 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black, 0 0 1px black !important; }
.glass {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(135deg, rgba(200, 225, 255, .12), rgba(50, 80, 125, .06)), rgba(15, 30, 55, .24);
    backdrop-filter: blur(2vh) saturate(155%);
    -webkit-backdrop-filter: blur(2vh) saturate(155%);
    box-shadow: inset 0 1px 0 #e0eeff24, 0 .5vh 2vh #07162b26;
}
.black-glass {
    border: 1px solid rgba(255, 255, 255, .12);
    background: linear-gradient(135deg, rgba(0, 0, 0, .12), rgba(0, 0, 0, .06)), rgba(0, 0, 0, .24);
    backdrop-filter: blur(2vh) saturate(155%);
    -webkit-backdrop-filter: blur(2vh) saturate(155%);
    box-shadow: inset 0 1px 0 #ffffff24, 0 .5vh 2vh #00000026;
}
button { font: inherit; color: var(--ink); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { cursor: default; opacity: .4; }
`;

export const messageButtonStyles = `
button { appearance: none; font: inherit; font-size: 2.2vh; height: 6vh; line-height: normal; padding: 1vh 2vh; border: 2px solid #ccc; border-radius: .5vh; color: inherit; background: rgba(255, 255, 255, .1); transition: color .18s ease, transform .12s ease; }
button:hover:not(:disabled), button:focus-visible:not(:disabled) { color: #FF6B6B; }
button:active:not(:disabled) { transform: translateY(.1vh); }
button kbd, button small { font: inherit; font-size: 2vh; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

export const identifierLinkStyles = `
.identifier { display: inline; margin: 0; padding: 0; border: 0; background: none; color: var(--accent, #a7d9ff); font: inherit; line-height: inherit; text-align: inherit; white-space: inherit; text-decoration: underline; text-underline-offset: .15em; cursor: pointer; }
.identifier:hover { color: #fff; }
.identifier:focus-visible { outline: .2vh solid var(--accent, #a7d9ff); outline-offset: .2vh; }
`;

export const itemTagStyles = `
.item-tags { display: flex; flex-wrap: wrap; align-items: center; gap: .4vh .65vh; min-width: 0; }
.item-tags[hidden] { display: none; }
.item-tag { display: inline-flex; align-items: center; gap: .4vh; max-width: 100%; padding: 1vh 2vh; border: 1px solid; border-radius: 999px; font-size: 2vh; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; text-align: left; }
.item-tag > span { min-width: 0; }
.item-tag svg { width: 1em; height: 1em; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.item-tag-item { color: #b9e2ff; border-color: #8dcaff60; background: #73baff12; }
.item-tag-item[data-tag-type="weight"], .item-tag-item[data-tag-type="volume"] { color: #dce6ef; border-color: #b3c7da50; background: #b3c7da10; font-variant-numeric: tabular-nums; }
.item-tag-item:is([data-tag-type="container"], [data-tag-type="open"], [data-tag-type="closed"], [data-tag-type="locked"], [data-tag-type^="capacity-"]) { color: #f2d5a5; border-color: #e0b77758; background: #d9a95d15; }
.item-tag-item[data-tag-type^="capacity-"] { font-variant-numeric: tabular-nums; }
.item-tag-state { color: #e6d4ff; border-color: #c5a2ef60; background: #ad7fdb29; border-radius: .5vh; }
`;

export const characterTagStyles = `
.character-tags { display: flex; flex-wrap: wrap; gap: .6vh; }
.information-chip { display: inline-flex; align-items: center; max-width: 100%; min-height: 3.2vh; padding: 1vh 2vh; border: .15vh dashed rgba(202, 181, 235, .8); border-radius: 2vh; background: rgba(53, 38, 73, .94); color: var(--ink); font-size: 2vh; line-height: 1.2; overflow-wrap: anywhere; }
.state-chip { --state-chip-background: rgba(15, 52, 91, .92); --state-chip-border: rgba(116, 185, 239, .62); position: relative; display: inline-flex; align-items: center; max-width: 100%; min-height: 3.2vh; padding: 1vh 2vh; border: 1px solid var(--state-chip-border); border-radius: 1vh; background: var(--state-chip-background); color: var(--ink); font-size: .9em; line-height: 1.2; overflow: hidden; overflow-wrap: anywhere; }
.state-chip[data-color-scheme="somewhat"] { --state-chip-background: rgba(43, 88, 128, .8); --state-chip-border: rgba(154, 207, 245, .55); }
.state-chip[data-color-scheme="standard"] { --state-chip-background: rgba(15, 52, 91, .92); --state-chip-border: rgba(116, 185, 239, .62); }
.state-chip[data-color-scheme="very"] { --state-chip-background: rgba(101, 76, 15, .94); --state-chip-border: rgba(249, 209, 92, .7); }
.state-chip[data-color-scheme="overwhelming"] { --state-chip-background: rgba(108, 26, 30, .95); --state-chip-border: rgba(255, 124, 124, .72); }
.state-chip.relieving { background: linear-gradient(180deg, rgba(173, 231, 255, .22), transparent 65%), var(--state-chip-background); }
.state-chip.relieving::after { content: ''; position: absolute; inset: -120% 0 auto; height: 120%; background: linear-gradient(180deg, transparent, rgba(220, 250, 255, .38), transparent); animation: relief-descend 1.8s ease-in-out infinite; pointer-events: none; }
.state-chip small { align-self: flex-start; position: absolute; top: .05vh; left: 50%; transform: translateX(-50%); color: #d8f5ff; font-size: .55em; letter-spacing: .06em; text-transform: uppercase; z-index: 1; }
.state-chip.relieving > span { z-index: 1; }
@keyframes relief-descend { to { transform: translateY(210%); } }
`;
