"use strict";
const { render, useState, useEffect } = window.MiniReact;
function App() {
    return (MiniReact.createElement("div", null,
        MiniReact.createElement("h1", null, "1"),
        MiniReact.createElement("p", null,
            MiniReact.createElement("h2", null, "2"))));
}
render(MiniReact.createElement(App, null), document.getElementById('root'));
