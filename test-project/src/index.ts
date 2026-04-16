import { GET } from "@api/action";

const el = document.createElement("button");
el.innerText = "Click me";
el.onclick = () => {
	GET({ data: "Hello from client action!" }).then((res) => {
		console.log(res);
	});
};

document.body.appendChild(el);
