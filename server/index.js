const http = require('http')
const express = require('express')
const socketio = require('socket.io')
const cors = require('cors')
const { addUser, removeUser, getUser, getUsersInRoom } = require('./users')
const { Configuration, OpenAIApi } = require('openai')
require('dotenv').config()

const configuration = new Configuration({
  apiKey: process.env.OPEN_AI_SECRET,
})

const openai = new OpenAIApi(configuration)

const router = require('./router')

const app = express()
const server = http.createServer(app)
const io = socketio(server)

app.use(cors())
app.use(router)

io.on('connect', (socket) => {
  socket.on('join', ({ name, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, name, room })

    if (error) return callback(error)

    socket.join(user.room)

    socket.emit('message', {
      user: 'chattrbot',
      text: `${user.name}, welcome to room ${user.room}. Tag me @chattrbot with any questions.`,
    })
    socket.broadcast.to(user.room).emit('message', {
      user: 'chattrbot',
      text: `${user.name} has joined!`,
    })

    io.to(user.room).emit('roomData', {
      room: user.room,
      users: getUsersInRoom(user.room),
    })

    callback()
  })

  socket.on('sendMessage', (message, callback) => {
    if (message.includes('@chattrbot')) {
      async function runCompletions(message) {
        const completions = await openai.createCompletion({
          model: 'text-davinci-003',
          prompt: `You are a smart chatbot named chattrbot. ${message}`,
          max_tokens: 200,
        })
        io.to(user.room).emit('message', {
          user: 'chattrbot',
          text: completions.data.choices[0].text,
        })
      }
      runCompletions(message)
    }
    const user = getUser(socket.id)

    io.to(user.room).emit('message', { user: user.name, text: message })

    callback()
  })

  socket.on('disconnect', () => {
    const user = removeUser(socket.id)

    if (user) {
      io.to(user.room).emit('message', {
        user: 'chattrbot',
        text: `${user.name} has left.`,
      })
      io.to(user.room).emit('roomData', {
        room: user.room,
        users: getUsersInRoom(user.room),
      })
    }
  })
})

server.listen(process.env.PORT || 5000, () =>
  console.log(`Server has started.`)
)
