class DoubleIndexedKV {
	constructor() {
		(this.keyToValue = new Map()), (this.valueToKey = new Map());
	}
	set(key, value) {
		this.keyToValue.set(key, value), this.valueToKey.set(value, key);
	}
	getByKey(key) {
		return this.keyToValue.get(key);
	}
	getByValue(value) {
		return this.valueToKey.get(value);
	}
	clear() {
		this.keyToValue.clear(), this.valueToKey.clear();
	}
}
class Registry {
	constructor(generateIdentifier) {
		(this.generateIdentifier = generateIdentifier),
			(this.kv = new DoubleIndexedKV());
	}
	register(value, identifier) {
		if (this.kv.getByValue(value)) return;
		if (!identifier) identifier = this.generateIdentifier(value);
		this.kv.set(identifier, value);
	}
	clear() {
		this.kv.clear();
	}
	getIdentifier(value) {
		return this.kv.getByValue(value);
	}
	getValue(identifier) {
		return this.kv.getByKey(identifier);
	}
}
class ClassRegistry extends Registry {
	constructor() {
		super((c) => c.name);
		this.classToAllowedProps = new Map();
	}
	register(value, options) {
		if (typeof options === "object") {
			if (options.allowProps)
				this.classToAllowedProps.set(value, options.allowProps);
			super.register(value, options.identifier);
		} else super.register(value, options);
	}
	getAllowedProps(value) {
		return this.classToAllowedProps.get(value);
	}
}
function valuesOfObj(record) {
	if ("values" in Object) return Object.values(record);
	const values = [];
	for (const key in record)
		if (Object.hasOwn(record, key)) values.push(record[key]);
	return values;
}
function find(record, predicate) {
	const values = valuesOfObj(record);
	if ("find" in values) return values.find(predicate);
	const valuesNotNever = values;
	for (let i = 0; i < valuesNotNever.length; i++) {
		const value = valuesNotNever[i];
		if (predicate(value)) return value;
	}
	return;
}
function forEach(record, run) {
	Object.entries(record).forEach(([key, value]) => run(value, key));
}
function includes(arr, value) {
	return arr.indexOf(value) !== -1;
}
function findArr(record, predicate) {
	for (let i = 0; i < record.length; i++) {
		const value = record[i];
		if (predicate(value)) return value;
	}
	return;
}
class CustomTransformerRegistry {
	constructor() {
		this.transfomers = {};
	}
	register(transformer) {
		this.transfomers[transformer.name] = transformer;
	}
	findApplicable(v) {
		return find(this.transfomers, (transformer) => transformer.isApplicable(v));
	}
	findByName(name) {
		return this.transfomers[name];
	}
}
var getType = (payload) => Object.prototype.toString.call(payload).slice(8, -1),
	isUndefined = (payload) => typeof payload > "u",
	isNull = (payload) => payload === null,
	isPlainObject = (payload) => {
		if (typeof payload !== "object" || payload === null) return !1;
		if (payload === Object.prototype) return !1;
		if (Object.getPrototypeOf(payload) === null) return !0;
		return Object.getPrototypeOf(payload) === Object.prototype;
	},
	isEmptyObject = (payload) =>
		isPlainObject(payload) && Object.keys(payload).length === 0,
	isArray = (payload) => Array.isArray(payload),
	isString = (payload) => typeof payload === "string",
	isNumber = (payload) => typeof payload === "number" && !isNaN(payload),
	isBoolean = (payload) => typeof payload === "boolean",
	isRegExp = (payload) => payload instanceof RegExp,
	isMap = (payload) => payload instanceof Map,
	isSet = (payload) => payload instanceof Set,
	isSymbol = (payload) => getType(payload) === "Symbol",
	isDate = (payload) => payload instanceof Date && !isNaN(payload.valueOf()),
	isError = (payload) => payload instanceof Error,
	isNaNValue = (payload) => typeof payload === "number" && isNaN(payload),
	isPrimitive = (payload) =>
		isBoolean(payload) ||
		isNull(payload) ||
		isUndefined(payload) ||
		isNumber(payload) ||
		isString(payload) ||
		isSymbol(payload),
	isBigint = (payload) => typeof payload === "bigint",
	isInfinite = (payload) => payload === 1 / 0 || payload === -1 / 0,
	isTypedArray = (payload) =>
		ArrayBuffer.isView(payload) && !(payload instanceof DataView),
	isURL = (payload) => payload instanceof URL;
var escapeKey = (key) => key.replace(/\\/g, "\\\\").replace(/\./g, "\\."),
	stringifyPath = (path) => path.map(String).map(escapeKey).join("."),
	parsePath = (string, legacyPaths) => {
		let result = [],
			segment = "";
		for (let i = 0; i < string.length; i++) {
			const char = string.charAt(i);
			if (!legacyPaths && char === "\\") {
				const escaped = string.charAt(i + 1);
				if (escaped === "\\") {
					(segment += "\\"), i++;
					continue;
				} else if (escaped !== ".") throw Error("invalid path");
			}
			if (char === "\\" && string.charAt(i + 1) === ".") {
				(segment += "."), i++;
				continue;
			}
			if (char === ".") {
				result.push(segment), (segment = "");
				continue;
			}
			segment += char;
		}
		const lastSegment = segment;
		return result.push(lastSegment), result;
	};
function simpleTransformation(
	isApplicable,
	annotation,
	transform,
	untransform,
) {
	return { isApplicable, annotation, transform, untransform };
}
var simpleRules = [
	simpleTransformation(
		isUndefined,
		"undefined",
		() => null,
		() => {
			return;
		},
	),
	simpleTransformation(
		isBigint,
		"bigint",
		(v) => v.toString(),
		(v) => {
			if (typeof BigInt < "u") return BigInt(v);
			return console.error("Please add a BigInt polyfill."), v;
		},
	),
	simpleTransformation(
		isDate,
		"Date",
		(v) => v.toISOString(),
		(v) => new Date(v),
	),
	simpleTransformation(
		isError,
		"Error",
		(v, superJson) => {
			const baseError = { name: v.name, message: v.message };
			if ("cause" in v) baseError.cause = v.cause;
			return (
				superJson.allowedErrorProps.forEach((prop) => {
					baseError[prop] = v[prop];
				}),
				baseError
			);
		},
		(v, superJson) => {
			const e = Error(v.message, { cause: v.cause });
			return (
				(e.name = v.name),
				(e.stack = v.stack),
				superJson.allowedErrorProps.forEach((prop) => {
					e[prop] = v[prop];
				}),
				e
			);
		},
	),
	simpleTransformation(
		isRegExp,
		"regexp",
		(v) => "" + v,
		(regex) => {
			const body = regex.slice(1, regex.lastIndexOf("/")),
				flags = regex.slice(regex.lastIndexOf("/") + 1);
			return new RegExp(body, flags);
		},
	),
	simpleTransformation(
		isSet,
		"set",
		(v) => [...v.values()],
		(v) => new Set(v),
	),
	simpleTransformation(
		isMap,
		"map",
		(v) => [...v.entries()],
		(v) => new Map(v),
	),
	simpleTransformation(
		(v) => isNaNValue(v) || isInfinite(v),
		"number",
		(v) => {
			if (isNaNValue(v)) return "NaN";
			if (v > 0) return "Infinity";
			else return "-Infinity";
		},
		Number,
	),
	simpleTransformation(
		(v) => v === 0 && 1 / v === -1 / 0,
		"number",
		() => {
			return "-0";
		},
		Number,
	),
	simpleTransformation(
		isURL,
		"URL",
		(v) => v.toString(),
		(v) => new URL(v),
	),
];
function compositeTransformation(
	isApplicable,
	annotation,
	transform,
	untransform,
) {
	return { isApplicable, annotation, transform, untransform };
}
var symbolRule = compositeTransformation(
		(s, superJson) => {
			if (isSymbol(s)) return !!superJson.symbolRegistry.getIdentifier(s);
			return !1;
		},
		(s, superJson) => {
			return ["symbol", superJson.symbolRegistry.getIdentifier(s)];
		},
		(v) => v.description,
		(_, a, superJson) => {
			const value = superJson.symbolRegistry.getValue(a[1]);
			if (!value) throw Error("Trying to deserialize unknown symbol");
			return value;
		},
	),
	constructorToName = [
		Int8Array,
		Uint8Array,
		Int16Array,
		Uint16Array,
		Int32Array,
		Uint32Array,
		Float32Array,
		Float64Array,
		Uint8ClampedArray,
	].reduce((obj, ctor) => {
		return (obj[ctor.name] = ctor), obj;
	}, {}),
	typedArrayRule = compositeTransformation(
		isTypedArray,
		(v) => ["typed-array", v.constructor.name],
		(v) => [...v],
		(v, a) => {
			const ctor = constructorToName[a[1]];
			if (!ctor) throw Error("Trying to deserialize unknown typed array");
			return new ctor(v);
		},
	);
function isInstanceOfRegisteredClass(potentialClass, superJson) {
	if (potentialClass?.constructor)
		return !!superJson.classRegistry.getIdentifier(potentialClass.constructor);
	return !1;
}
var classRule = compositeTransformation(
		isInstanceOfRegisteredClass,
		(clazz, superJson) => {
			return [
				"class",
				superJson.classRegistry.getIdentifier(clazz.constructor),
			];
		},
		(clazz, superJson) => {
			const allowedProps = superJson.classRegistry.getAllowedProps(
				clazz.constructor,
			);
			if (!allowedProps) return { ...clazz };
			const result = {};
			return (
				allowedProps.forEach((prop) => {
					result[prop] = clazz[prop];
				}),
				result
			);
		},
		(v, a, superJson) => {
			const clazz = superJson.classRegistry.getValue(a[1]);
			if (!clazz)
				throw Error(
					`Trying to deserialize unknown class '${a[1]}' - check https://github.com/blitz-js/superjson/issues/116#issuecomment-773996564`,
				);
			return Object.assign(Object.create(clazz.prototype), v);
		},
	),
	customRule = compositeTransformation(
		(value, superJson) => {
			return !!superJson.customTransformerRegistry.findApplicable(value);
		},
		(value, superJson) => {
			return [
				"custom",
				superJson.customTransformerRegistry.findApplicable(value).name,
			];
		},
		(value, superJson) => {
			return superJson.customTransformerRegistry
				.findApplicable(value)
				.serialize(value);
		},
		(v, a, superJson) => {
			const transformer = superJson.customTransformerRegistry.findByName(a[1]);
			if (!transformer)
				throw Error("Trying to deserialize unknown custom value");
			return transformer.deserialize(v);
		},
	),
	compositeRules = [classRule, symbolRule, customRule, typedArrayRule],
	transformValue = (value, superJson) => {
		const applicableCompositeRule = findArr(compositeRules, (rule) =>
			rule.isApplicable(value, superJson),
		);
		if (applicableCompositeRule)
			return {
				value: applicableCompositeRule.transform(value, superJson),
				type: applicableCompositeRule.annotation(value, superJson),
			};
		const applicableSimpleRule = findArr(simpleRules, (rule) =>
			rule.isApplicable(value, superJson),
		);
		if (applicableSimpleRule)
			return {
				value: applicableSimpleRule.transform(value, superJson),
				type: applicableSimpleRule.annotation,
			};
		return;
	},
	simpleRulesByAnnotation = {};
simpleRules.forEach((rule) => {
	simpleRulesByAnnotation[rule.annotation] = rule;
});
var untransformValue = (json, type, superJson) => {
	if (isArray(type))
		switch (type[0]) {
			case "symbol":
				return symbolRule.untransform(json, type, superJson);
			case "class":
				return classRule.untransform(json, type, superJson);
			case "custom":
				return customRule.untransform(json, type, superJson);
			case "typed-array":
				return typedArrayRule.untransform(json, type, superJson);
			default:
				throw Error("Unknown transformation: " + type);
		}
	else {
		const transformation = simpleRulesByAnnotation[type];
		if (!transformation) throw Error("Unknown transformation: " + type);
		return transformation.untransform(json, superJson);
	}
};
var getNthKey = (value, n) => {
	if (n > value.size) throw Error("index out of bounds");
	const keys = value.keys();
	while (n > 0) keys.next(), n--;
	return keys.next().value;
};
function validatePath(path) {
	if (includes(path, "__proto__"))
		throw Error("__proto__ is not allowed as a property");
	if (includes(path, "prototype"))
		throw Error("prototype is not allowed as a property");
	if (includes(path, "constructor"))
		throw Error("constructor is not allowed as a property");
}
var getDeep = (object, path) => {
		validatePath(path);
		for (let i = 0; i < path.length; i++) {
			const key = path[i];
			if (isSet(object)) object = getNthKey(object, +key);
			else if (isMap(object)) {
				const row = +key,
					type = +path[++i] === 0 ? "key" : "value",
					keyOfRow = getNthKey(object, row);
				switch (type) {
					case "key":
						object = keyOfRow;
						break;
					case "value":
						object = object.get(keyOfRow);
						break;
				}
			} else object = object[key];
		}
		return object;
	},
	setDeep = (object, path, mapper) => {
		if ((validatePath(path), path.length === 0)) return mapper(object);
		let parent = object;
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i];
			if (isArray(parent)) {
				const index = +key;
				parent = parent[index];
			} else if (isPlainObject(parent)) parent = parent[key];
			else if (isSet(parent)) {
				const row = +key;
				parent = getNthKey(parent, row);
			} else if (isMap(parent)) {
				if (i === path.length - 2) break;
				const row = +key,
					type = +path[++i] === 0 ? "key" : "value",
					keyOfRow = getNthKey(parent, row);
				switch (type) {
					case "key":
						parent = keyOfRow;
						break;
					case "value":
						parent = parent.get(keyOfRow);
						break;
				}
			}
		}
		const lastKey = path[path.length - 1];
		if (isArray(parent)) parent[+lastKey] = mapper(parent[+lastKey]);
		else if (isPlainObject(parent)) parent[lastKey] = mapper(parent[lastKey]);
		if (isSet(parent)) {
			const oldValue = getNthKey(parent, +lastKey),
				newValue = mapper(oldValue);
			if (oldValue !== newValue) parent.delete(oldValue), parent.add(newValue);
		}
		if (isMap(parent)) {
			const row = +path[path.length - 2],
				keyToRow = getNthKey(parent, row);
			switch (+lastKey === 0 ? "key" : "value") {
				case "key": {
					const newKey = mapper(keyToRow);
					if ((parent.set(newKey, parent.get(keyToRow)), newKey !== keyToRow))
						parent.delete(keyToRow);
					break;
				}
				case "value": {
					parent.set(keyToRow, mapper(parent.get(keyToRow)));
					break;
				}
			}
		}
		return object;
	};
var enableLegacyPaths = (version) => version < 1;
function traverse(tree, walker, version, origin = []) {
	if (!tree) return;
	const legacyPaths = enableLegacyPaths(version);
	if (!isArray(tree)) {
		forEach(tree, (subtree, key) =>
			traverse(subtree, walker, version, [
				...origin,
				...parsePath(key, legacyPaths),
			]),
		);
		return;
	}
	const [nodeValue, children] = tree;
	if (children)
		forEach(children, (child, key) => {
			traverse(child, walker, version, [
				...origin,
				...parsePath(key, legacyPaths),
			]);
		});
	walker(nodeValue, origin);
}
function applyValueAnnotations(plain, annotations, version, superJson) {
	return (
		traverse(
			annotations,
			(type, path) => {
				plain = setDeep(plain, path, (v) =>
					untransformValue(v, type, superJson),
				);
			},
			version,
		),
		plain
	);
}
function applyReferentialEqualityAnnotations(plain, annotations, version) {
	const legacyPaths = enableLegacyPaths(version);
	function apply(identicalPaths, path) {
		const object = getDeep(plain, parsePath(path, legacyPaths));
		identicalPaths
			.map((path2) => parsePath(path2, legacyPaths))
			.forEach((identicalObjectPath) => {
				plain = setDeep(plain, identicalObjectPath, () => object);
			});
	}
	if (isArray(annotations)) {
		const [root, other] = annotations;
		if (
			(root.forEach((identicalPath) => {
				plain = setDeep(
					plain,
					parsePath(identicalPath, legacyPaths),
					() => plain,
				);
			}),
			other)
		)
			forEach(other, apply);
	} else forEach(annotations, apply);
	return plain;
}
var isDeep = (object, superJson) =>
	isPlainObject(object) ||
	isArray(object) ||
	isMap(object) ||
	isSet(object) ||
	isError(object) ||
	isInstanceOfRegisteredClass(object, superJson);
function addIdentity(object, path, identities) {
	const existingSet = identities.get(object);
	if (existingSet) existingSet.push(path);
	else identities.set(object, [path]);
}
function generateReferentialEqualityAnnotations(identitites, dedupe) {
	let result = {},
		rootEqualityPaths = void 0;
	if (
		(identitites.forEach((paths) => {
			if (paths.length <= 1) return;
			if (!dedupe)
				paths = paths
					.map((path) => path.map(String))
					.sort((a, b) => a.length - b.length);
			const [representativePath, ...identicalPaths] = paths;
			if (representativePath.length === 0)
				rootEqualityPaths = identicalPaths.map(stringifyPath);
			else
				result[stringifyPath(representativePath)] =
					identicalPaths.map(stringifyPath);
		}),
		rootEqualityPaths)
	)
		if (isEmptyObject(result)) return [rootEqualityPaths];
		else return [rootEqualityPaths, result];
	else return isEmptyObject(result) ? void 0 : result;
}
var walker = (
	object,
	identities,
	superJson,
	dedupe,
	path = [],
	objectsInThisPath = [],
	seenObjects = new Map(),
) => {
	const primitive = isPrimitive(object);
	if (!primitive) {
		addIdentity(object, path, identities);
		const seen = seenObjects.get(object);
		if (seen) return dedupe ? { transformedValue: null } : seen;
	}
	if (!isDeep(object, superJson)) {
		const transformed2 = transformValue(object, superJson),
			result2 = transformed2
				? {
						transformedValue: transformed2.value,
						annotations: [transformed2.type],
					}
				: { transformedValue: object };
		if (!primitive) seenObjects.set(object, result2);
		return result2;
	}
	if (includes(objectsInThisPath, object)) return { transformedValue: null };
	const transformationResult = transformValue(object, superJson),
		transformed = transformationResult?.value ?? object,
		transformedValue = isArray(transformed) ? [] : {},
		innerAnnotations = {};
	forEach(transformed, (value, index) => {
		if (
			index === "__proto__" ||
			index === "constructor" ||
			index === "prototype"
		)
			throw Error(
				`Detected property ${index}. This is a prototype pollution risk, please remove it from your object.`,
			);
		const recursiveResult = walker(
			value,
			identities,
			superJson,
			dedupe,
			[...path, index],
			[...objectsInThisPath, object],
			seenObjects,
		);
		if (
			((transformedValue[index] = recursiveResult.transformedValue),
			isArray(recursiveResult.annotations))
		)
			innerAnnotations[escapeKey(index)] = recursiveResult.annotations;
		else if (isPlainObject(recursiveResult.annotations))
			forEach(recursiveResult.annotations, (tree, key) => {
				innerAnnotations[escapeKey(index) + "." + key] = tree;
			});
	});
	const result = isEmptyObject(innerAnnotations)
		? {
				transformedValue,
				annotations: transformationResult
					? [transformationResult.type]
					: void 0,
			}
		: {
				transformedValue,
				annotations: transformationResult
					? [transformationResult.type, innerAnnotations]
					: innerAnnotations,
			};
	if (!primitive) seenObjects.set(object, result);
	return result;
};
function getType2(payload) {
	return Object.prototype.toString.call(payload).slice(8, -1);
}
function isArray2(payload) {
	return getType2(payload) === "Array";
}
function isPlainObject2(payload) {
	if (getType2(payload) !== "Object") return !1;
	const prototype = Object.getPrototypeOf(payload);
	return (
		!!prototype &&
		prototype.constructor === Object &&
		prototype === Object.prototype
	);
}
function assignProp(carry, key, newVal, originalObject, includeNonenumerable) {
	const propType = {}.propertyIsEnumerable.call(originalObject, key)
		? "enumerable"
		: "nonenumerable";
	if (propType === "enumerable") carry[key] = newVal;
	if (includeNonenumerable && propType === "nonenumerable")
		Object.defineProperty(carry, key, {
			value: newVal,
			enumerable: !1,
			writable: !0,
			configurable: !0,
		});
}
function copy(target, options = {}) {
	if (isArray2(target)) return target.map((item) => copy(item, options));
	if (!isPlainObject2(target)) return target;
	const props = Object.getOwnPropertyNames(target),
		symbols = Object.getOwnPropertySymbols(target);
	return [...props, ...symbols].reduce((carry, key) => {
		if (key === "__proto__") return carry;
		if (isArray2(options.props) && !options.props.includes(key)) return carry;
		const val = target[key],
			newVal = copy(val, options);
		return assignProp(carry, key, newVal, target, options.nonenumerable), carry;
	}, {});
}
class SuperJSON {
	constructor({ dedupe = !1 } = {}) {
		(this.classRegistry = new ClassRegistry()),
			(this.symbolRegistry = new Registry((s) => s.description ?? "")),
			(this.customTransformerRegistry = new CustomTransformerRegistry()),
			(this.allowedErrorProps = []),
			(this.dedupe = dedupe);
	}
	serialize(object) {
		const identities = new Map(),
			output = walker(object, identities, this, this.dedupe),
			res = { json: output.transformedValue };
		if (output.annotations)
			res.meta = { ...res.meta, values: output.annotations };
		const equalityAnnotations = generateReferentialEqualityAnnotations(
			identities,
			this.dedupe,
		);
		if (equalityAnnotations)
			res.meta = { ...res.meta, referentialEqualities: equalityAnnotations };
		if (res.meta) res.meta.v = 1;
		return res;
	}
	deserialize(payload, options) {
		let { json, meta } = payload,
			result = options?.inPlace ? json : copy(json);
		if (meta?.values)
			result = applyValueAnnotations(result, meta.values, meta.v ?? 0, this);
		if (meta?.referentialEqualities)
			result = applyReferentialEqualityAnnotations(
				result,
				meta.referentialEqualities,
				meta.v ?? 0,
			);
		return result;
	}
	stringify(object) {
		return JSON.stringify(this.serialize(object));
	}
	parse(string) {
		return this.deserialize(JSON.parse(string), { inPlace: !0 });
	}
	registerClass(v, options) {
		this.classRegistry.register(v, options);
	}
	registerSymbol(v, identifier) {
		this.symbolRegistry.register(v, identifier);
	}
	registerCustom(transformer, name) {
		this.customTransformerRegistry.register({ name, ...transformer });
	}
	allowErrorProps(...props) {
		this.allowedErrorProps.push(...props);
	}
}
SuperJSON.defaultInstance = new SuperJSON();
SuperJSON.serialize = SuperJSON.defaultInstance.serialize.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.deserialize = SuperJSON.defaultInstance.deserialize.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.stringify = SuperJSON.defaultInstance.stringify.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.parse = SuperJSON.defaultInstance.parse.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.registerClass = SuperJSON.defaultInstance.registerClass.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.registerSymbol = SuperJSON.defaultInstance.registerSymbol.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.registerCustom = SuperJSON.defaultInstance.registerCustom.bind(
	SuperJSON.defaultInstance,
);
SuperJSON.allowErrorProps = SuperJSON.defaultInstance.allowErrorProps.bind(
	SuperJSON.defaultInstance,
);
var dist_default = SuperJSON;
var {
	serialize,
	deserialize,
	stringify,
	parse,
	registerClass,
	registerCustom,
	registerSymbol,
	allowErrorProps,
} = SuperJSON;
function parseData(formData) {
	const propsArray = [];
	if (!formData) return propsArray;
	const batchsIDs = [];
	for (const [key, value] of Array.from(formData.entries()))
		if (key.startsWith("FILE_")) propsArray.push(value);
		else if (key.startsWith("FILES_")) {
			if (batchsIDs.includes(key)) continue;
			batchsIDs.push(key), propsArray.push(formData.getAll(key));
		} else propsArray.push(JSON.parse(decodeURI(value)));
	return propsArray;
}
function paramsFromURL(url) {
	return url.searchParams
		.entries()
		.toArray()
		.map(([_, v]) => v)
		.map((param) => JSON.parse(decodeURIComponent(param)));
}
async function WrapRequestHandler(context, endpoint) {
	if (context.request.headers.get("x-server-action") !== "true")
		return new Response("Not Found", { status: 404 });
	const parsedData =
			context.request.method === "GET" || context.request.method === "HEAD"
				? paramsFromURL(new URL(context.request.url))
				: parseData(
						context.request.headers.get("content-type")
							? await context.request.formData()
							: void 0,
					),
		missingProps = endpoint.length - parsedData.length;
	for (let i = 0; i < missingProps; i++) parsedData.push(void 0);
	parsedData.push(context);
	const result = await endpoint(...parsedData);
	switch (typeof result) {
		case "string":
		case "number":
		case "boolean":
		case "bigint":
			return new Response(dist_default.stringify(result), {
				headers: { "Content-Type": "application/json", dataType: "json" },
			});
		case "undefined":
			return new Response(null, { status: 204 });
		case "object":
			if (result instanceof Response)
				return result.headers.set("dataType", "response"), result;
			else if (result instanceof Blob) {
				const res = new Response(await result.arrayBuffer());
				return (
					res.headers.set("dataType", "blob"),
					res.headers.set("Content-Type", result.type),
					res
				);
			} else if (result instanceof File)
				return new Response(await result.arrayBuffer(), {
					headers: {
						"Content-Type": result.type,
						dataType: "file",
						fileData: JSON.stringify({
							name: result.name,
							lastModified: result.lastModified,
						}),
					},
				});
			else
				return new Response(dist_default.stringify(result), {
					headers: { "Content-Type": "application/json", dataType: "json" },
				});
		default:
			throw Error(`Unsupported return type from action: ${typeof result}`);
	}
}
var onRequest = async (context) => {
	const method = context.request.method,
		options = {
			GET: typeof GET === "function" ? GET : void 0,
			POST: typeof POST === "function" ? POST : void 0,
			PUT: typeof PUT === "function" ? PUT : void 0,
			DELETE: typeof DELETE === "function" ? DELETE : void 0,
			PATCH: typeof PATCH === "function" ? PATCH : void 0,
			HEAD: typeof HEAD === "function" ? HEAD : void 0,
			OPTIONS: typeof OPTIONS === "function" ? OPTIONS : void 0,
		};
	if (!options[method])
		return new Response(`Method "${method}" Not Allowed`, { status: 405 });
	return await WrapRequestHandler(context, options[method]);
};
export { onRequest };
