"no-action";
import { renderToString } from "react-dom/server";

const El = <div>Test</div>;

export async function GET() {
	return renderToString(El);
}
