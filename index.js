// standard node.js server
const express = require('express')
// express integration for apollo server to easily build a graphql api
const { ApolloServer } = require('apollo-server-express')
// 
const { Photon } = require('@generated/photon')
// nexus allows us to take code-first approach to creating our api
const { objectType, queryType, makeSchema } = require("nexus")
// nexus-prisma is the plugin which we use for the t.model.** below
const { nexusPrismaPlugin } = require('nexus-prisma')
// used below
const { join } = require('path')
// create an instance of photon
const photon = new Photon()

// represents a user type. only fields exposed are id and email
const User = objectType({
  name: 'User',
  // 't.model' provided by nexus-prisma
  definition(t) {
    t.model.id(),
      t.model.email()
  }
})

// post type. exposing id, 
const Post = objectType({
  name: 'Post',
  // 't.model' provided by nexus-prisma
  definition(t) {
    t.model.id(),
      t.model.title(),
      t.model.author()
  }
})

// root query type
const Query = queryType({
  definition(t) {
    // define a query to retrieve posts based on an offset
    t.list.field('postsOffset', {
      // post type as defined above
      type: 'Post',
      // resolvers , arguments destructured from request
      resolve: async (parent, { offset, limit }, ctx) => {
        // if not provided, inform client/end-user
        if (!offset || !limit) throw new Error('Please provide an offset and limit.')
        let posts = []
        try {
          // notice that prisma and nexus already have out-of-the-box support
          // for requesting a collection of records by including a skip and first
          posts = await ctx.photon.posts.findMany({ skip: offset, first: limit })
        } catch (error) { console.log(error) }

        return posts
      }
    }),
      // resolvers , arguments destructured from request
      t.list.field('postsCursor', {
        type: 'Post',
        resolve: async (parent, { cursor, limit }, ctx) => {
          // if not provided, inform client/end-user
          if (!cursor || !limit) throw new Error('Please provide an cursor and limit.')
          let posts = []
          try {
            // also includes out-of-the-box support for starting at a cursor record
            posts = await ctx.photon.posts.findMany({ after: cursor, first: limit })
          } catch (error) { console.log(error) }

          return posts
        }
      })
  }
});

// provided by nexus to create a scheme from our types with additional optional configuration
const schema = makeSchema({
  // our three main types from above
  types: [Query, User, Post],
  // this plugin gives us access to the t.model.**
  plugins: [nexusPrismaPlugin()],
  outputs: {
    typegen: join(
      __dirname,
      '../node_modules/@types/nexus-typegen/index.d.ts',
    ),
  },
});

async function seedDb() {
  try {
    const user = await photon.users.create({
      data: {
        email: 'alicde4sc@f43prisma.io',
        name: 'alice',
      }
    })
    const post_1 = await photon.posts.create({
      data: {
        title: 'Example Post 1',
        author: { connect: { id: user.id } }, published: true
      },
    })
    // ...should create a few more posts
  } catch (err) {
    console.log(err)
  }
}

// creating apollo-server
const server = new ApolloServer({ schema, context: { photon } })
// standard express server
const app = express();
// 
server.applyMiddleware({ app })

app.listen({ port: 4000 }, () => {
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
})