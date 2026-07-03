import React, {useState} from "react";

function StGround() {

  let [post] = useState([
    {title: '제목', content: '내용'},
    {title: '제목', content: '내용'},
    {title: '제목', content: '내용'},
    {title: '제목', content: '내용'}
  ])

  let [likes, setLikes] = useState([0, 0, 0, 0])

  return (
    <> 
      {post.map((item, index) => (
        <div key={index}>
          <p>{item.title}</p>
          <span>{item.content}</span>
          <em>넘버{index + 1}</em>
          <button type="button" onClick={() => {
            let copy = [...likes]
            copy[index] += 1
            setLikes(copy)
          }}>좋아요 {likes[index]}</button>
        </div>
      ))}
    </>
  )
}

export default StGround
