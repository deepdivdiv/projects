/**
 * @param { form | grid | line | min | data | log } set 
**/


function Table({
    set = "form",
    className = "",
    children,
    ...rest
}) {
    const classes = [`tb-${set}`, className]
        .filter(Boolean)
        .join(" ");

    if(set === "form") {
        return (
            <div className={classes} {...rest}>
                <table>
                    <colgroup>
                        <col width="15%"/>
                        <col width="35%"/>
                        <col width="15%"/>
                        <col width="35%"/>
                    </colgroup>
                    {children}
                </table>
            </div>
        )
    } 
    else {
        return (
            <div className={classes} {...rest}>
                <table>
                    {children}
                </table>
            </div>
        )
    }

}

export default Table;
