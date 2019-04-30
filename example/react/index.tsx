import React from "react";
import ReactDOM from "react-dom";
const app = document.getElementById("app");

const View = (props: { date: Date }) => <div>{props.date.toISOString()}</div>;

ReactDOM.render(<View date={new Date()} />, app);
