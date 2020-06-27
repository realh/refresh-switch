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
        } else if (o instanceof Error) {
            return `${o} at ${o.fileName}: line ${o.lineNumber}`;
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

function arrayToObjects(ar, ctor, name) {
    if (ar instanceof Variant) {
        ar = ar.deepUnpack();
    }
    if (!ar || ar.length === undefined) {
        log(`No source array (${ar}) to create array of ${name}`);
        return [];
    } else if (!ar.length) {
        log(`Empty source array for array of ${name}`);
        return [];
    }
    return ar.map(a => {
        try {
            return ctor(a);
        } catch (error) {
            log(`Error creating ${name} from ${a}: ${error}`);
            log(logObject(error.stack));
            return null;
        }
    }).filter(a => a != null);
}

function readProperties(o) {
    if (o instanceof Variant) {
        o = o.deepUnpack();
    }
    let result = {};
    for (const k in o) {
        let v = o[k];
        if (v instanceof Variant)
            v = v.deepUnpack();
        result[k] = v;
    }
    return result;
}


function isRoundable(n) {
    return (Math.ceil(n) - n < 0.1) || (n - Math.floor(n) < 0.1);
}

function wouldRoundTheSame(a, b) {
    return a == b ||
        (isRoundable(a) && isRoundable(b) && Math.round(a) == Math.round(b));
}

// Returns a rounded to log10(b) decimal places
function roundBy(a, b) {
    return Math.round(a * b) / b;
}

