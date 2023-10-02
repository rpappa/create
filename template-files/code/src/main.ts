import { add, hello } from "{{SCOPEPREFIX}}lib";

export function format(name: string, x: number, y: number) {
    return `${hello(name)} ${x} + ${y} = ${add(x, y)}`;
}
