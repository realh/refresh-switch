function logObject(o, indent) {
    if (!indent)
        indent = "";
    let s = "{\n";
    const nested = indent + "  ";
    for (const k in o) { //of Object.getOwnPropertyNames(o)) {
        s += `${nested}${k}: `;
        const v = o[k];
        if (typeof v == "string") {
            s += `"${v}"`;
        } else if (typeof v == "number" || !v || v === true) {
            s += `${v}`;
        } else {
            s += logObject(v, nested);
        }
        s += ",\n";
    }
    s += indent + '}';
    return s;
}

function logError(error, detail) {
    log(`${detail}:\n${logObject(error)}`);
}

