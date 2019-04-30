import React from "https://dev.jspm.io/react@16.8.6";
import ReactDOM from "https://dev.jspm.io/react-dom@16.8.6";
const app = document.getElementById("app");
const View = (props) => React.createElement("div", null, props.date.toISOString());
ReactDOM.render(React.createElement(View, { date: new Date() }), app);
