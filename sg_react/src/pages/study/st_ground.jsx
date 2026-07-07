import React, {useState} from "react";

function StGround() {

  let [guest] = useState([
    {
      title: '리액트공부',
      content: '반복형 게시글',
      data: '2026-07-07',
      label: '개발',
    },
    {
      title: '디자인 공부',
      content: '반복형 게시글',
      data: '2026-07-07',
      label: '디자인',
    },
    {
      title: '피그마 공부',
      content: '반복형 게시글',
      data: '2026-07-07',
      label: '디자인',
    },
    {
      title: '모델링 개발',
      content: '반복형 게시글',
      data: '2026-07-07',
      label: '3D',
    },
  ])
  let [likes, setLikes] = useState([0, 0, 0, 0])

  return (
    <> 
      {
        guest.map((item, index) => (
          <div key={index}>
            <em>{item.label}</em>
            <dl>
              <dt>{item.title}</dt>
              <dd>{item.content}</dd>
            </dl>
            <span>{item.data}</span>
            <button type="button" onClick={() => {
              let likeGet = [...likes]
              likeGet[index] += 1
              setLikes(likeGet)
            }}>좋아요 {likes[index]}</button>
          </div>
        ))
      }
    </>
  )
}

export default StGround
