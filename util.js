const {Variant} = imports.gi.GLib;

function logObject(o, indent) {
    try {
        if (typeof o == "string") {
            return `"${o}"`;
        } else if (typeof o == "number" || !o || o === true) {
            return `${o}`;
        } else if (o instanceof Function) {
            return "function";
        } else if (o instanceof Variant) {
            return `Variant(${o.deepUnpack()})`;
        } else {
            if (!indent)
                indent = "";
            let s = "{\n";
            const nested = indent + "  ";
            for (const k in o) { //of Object.getOwnPropertyNames(o)) {
                s += `${nested}${k}: `;
                const v = o[k];
                s += logObject(v, nested);
                s += ",\n";
            }
            s += indent + '}';
            return s;
        }
    } catch (error) {
        return `${error}`;
    }
}

function logError(error, detail) {
    log(`${detail}:\n${logObject(error)}`);
}

