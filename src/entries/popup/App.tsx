import { useState } from "react";
import wxtLogo from "~assets/logo.svg";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <div className="">
        <a href="https://wxt.dev" target="_blank">
          <img src={wxtLogo} className="b" alt="WXT logo" />
        </a>
      </div>
      <h1>Pare</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the WXT and React logos to learn more</p>
    </>
  );
}

export default App;
