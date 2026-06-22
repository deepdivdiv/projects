/**
 * @param { ul | ol } type
 * @param { 
 * type.ul [ dot | box | dash | cau ]  
 * type.ol [ num | latin | roman ] } set
 * 
 * 
**/


function List({
    set = "dot",
    size = "m",
    className = "",
    children,
    ...rest
}) {
    const classes = [`${set}-list-${size}`, className]
        .filter(Boolean)
        .join(" ");

    if(["dot", "box", "dash", "cau"].includes(set)) {
        return (
            <ul className={classes} {...rest}>
                {children}
            </ul>
        )
    } else {
        return (
            <ol className={classes} {...rest}>
                {children}
            </ol>
        )
    }

}

export default List;
