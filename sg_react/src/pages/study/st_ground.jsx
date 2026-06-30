import React, {useState} from "react";

function StGround() {

  let [post] = useState([
    {title: '제목', content: '내용'},
    {title: '제목', content: '내용'},
    {title: '제목', content: '내용'},
    {title: '제목', content: '내용'}
  ])

  return (
    <>
      {post.map((item, index) => (
        <div key={index}>
          <p>{item.title}{index+1}</p>
          <span>{item.content}{index+1}</span>
          <em>넘버{index + 1}</em>
        </div>
      ))}
    </>
  )
}

export default StGround
