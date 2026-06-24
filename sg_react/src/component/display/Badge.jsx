/**
 * @param { ul | ol } type
 * @param { dot | box | dash | cau | num | latin | roman } set  ** dot = ● | box = ■ | dash = - | cau = ※ | num = 1 | latin = a | roman = i
 * 
 * 
**/


function Badge({
    set = "lb",
    size = "m",
    state = "",
    id="",
    className = "",
    children,
    ...rest
}) {
    const classes = [`${set}-${size}`, state, className]
        .filter(Boolean)
        .join(" ");

    if(set == "lb") {
        return (
            <em className={classes} {...rest}>
                {children}
            </em>
        )
    } 
    else if(set == "tag"){
        return (
            <em className={classes} {...rest}>
                {children}
            </em>
        )
    }
    else if(set == "chip"){
        return (
            <label className={classes} for={id}>
                <input type="checkbox" id={id} class="chip-kill" {...rest} />
                <span>{children}</span>
                <i className="ico-close"></i>
            </label>
        )
    }

}

export default Badge;
