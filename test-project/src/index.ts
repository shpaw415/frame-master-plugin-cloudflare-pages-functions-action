import { GET } from "@api/react";

const el = document.createElement("button");
el.innerText = "Click me";
el.onclick = () => {
	GET().then((res) => {
		console.log(res);
	});
};

document.body.appendChild(el);
