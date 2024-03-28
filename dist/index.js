"use strict";
const { render, useState, useEffect } = window.MiniReact;
// 第一次渲染测试的App组件
// function App() {
//   return (
//     <div>
//       <h1>1</h1>
//       <p>
//         <h2>2</h2>
//       </p>
//     </div>
//   );
// }
function App() {
    const [state, setState] = useState(true);
    return (MiniReact.createElement("div", null,
        MiniReact.createElement("h1", null, "1"),
        MiniReact.createElement("p", { onclick: () => setState(false) }, state ? MiniReact.createElement("h2", null, "2") : MiniReact.createElement("h3", null, "3"))));
}
render(MiniReact.createElement(App, null), document.getElementById('root'));
