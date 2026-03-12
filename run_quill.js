const JSDOM = require("jsdom").JSDOM;
const dom = new JSDOM(`<!DOCTYPE html><div><p>Paragraph</p><ul><li>One</li><li>Two</li></ul></div>`);
const window = dom.window;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;

const Quill = require("quill");
const quill = new Quill(document.querySelector("div"), { theme: "snow" });
console.log(quill.root.innerHTML);
