import React from "react";
import "./styles.css";

export default function Landing(){
  return (
    <section className="hero">
      <div className="hero-content">
        <span className="tag">XAUUSD · AI POWERED PRECISION TRADING</span>

        <h1>
          TRADE GOLD LIKE
          <br/>
          <span>A SNIPER.</span>
        </h1>

        <p>
          Real-time XAUUSD data, AI signals, TP/SL monitoring,
          macro news and multi-timeframe analysis — all in one elite trading platform.
        </p>

        <div className="buttons">
          <button className="create">CREATE ACCOUNT →</button>
          <button className="login">LOGIN</button>
        </div>
      </div>
    </section>
  );
}
