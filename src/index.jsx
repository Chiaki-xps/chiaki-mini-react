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
  return (
    <div>
      <h1>1</h1>
      <p onclick={() => setState(false)}>{state ? <h2>2</h2> : <h3>3</h3>}</p>
    </div>
  );
}
render(<App />, document.getElementById('root'));
