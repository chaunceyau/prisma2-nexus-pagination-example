# prisma2-nexus-pagination-example
Example directory using Prisma2, GraphQL Nexus and Apollo Server to create paginated queries.

## Overview
In this tutorial, you will learn the fundamentals of implementing pagination with [Prisma2](https://www.prisma.io/blog/announcing-prisma-2-zq1s745db8i5#getting-started-with-prisma-2). If you are unfamiliar with Prisma, we definitely suggest exploring the [Prisma Website](https://www.prisma.io). Prisma2 is rewrite  of the original Prisma, with two tools for handling your database workflows: `Photon` and `Lift`. You can read more about both tools and the motivation on the [Prisma 2 Preview blog post](https://www.prisma.io/blog/announcing-prisma-2-zq1s745db8i5).

## Steps to Completion

1. **npx prisma2 init pagination-example**
  Follow the prompts with these options: (1) blank project, (2) SQLite, (3) include photon and lift -> confirm, (4) JavaScript - feel free to use TypeScript, (5) Just the prisma schema. You should now have a folder called *pagination-example* with a prisma folder inside.
2. **npm init** - select defaults - should run in *pagination-example* directory
3. **package.json** - add to scripts to run apollo server & generate db schema
        
```js
"dev": "node ./index.js",
"postinstall": "prisma2 generate"
```

4. **npm i prisma2 --save-dev**
You will notice this likely unfamiliar line print in the console: *"Downloading darwin binary for query-engine and migration-engine"*. This is the postinstallation hook running and generating the `Photon` client.
5. **npm i express apollo-server-express nexus nexus-prisma graphql**
  Take a look at the [`Libraries Overview`](#libraries-overview) section to understand what each library does.
6. **Create index.js file for apollo-server and add Photon client**
This is a standard apollo server with no special functionality added yet. In the next steps you will add GraphQL Nexus and start implementing our schema.

```js
// index.js
const express = require('express');
const { ApolloServer } = require('apollo-server-express');

// you will add GraphQL Nexus schema here in next step

const server = new ApolloServer({ });

const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
);
```
        
12. **Add GraphQL Nexus -** Rather than the standard apollo server typedefs and resolvers, you are going to use GraphQL nexus.

```js
// index.js
// ADD IMPORTS
// Photon is our type-safe database access client
const { Photon } = require('@generated/photon')
// create an instance of photon
const photon = new Photon()
// nexus allows us to take code-first approach to creating our api
const { objectType, queryType, makeSchema } = require("nexus")
// nexus-prisma is the plugin which you use for the t.model.** below
const { nexusPrismaPlugin } = require('nexus-prisma')
// used below
const { join } = require('path')
```
      
Next, you have to add the models you wish to expose in our API. This is similar to the typeDefs used in a standard Apollo Server without Nexus.

```js 
// index.js
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
    // you will add pagination queries here
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
```
You also need to update our `ApolloServer` constructor to include our `schema` and `photon` instance.

```js
// index.js
const server = new ApolloServer({ schema, context: { photon } })
```

13. Add Pagination Queries
Now you need to update our `Query` type to include a query that you can use to request paginated results. Below are two seperate queries, one for `offsets` and one for `cursors`. While the queries are very similar, notice the difference in arguments passed to the resolvers


```js
// index.js
// root query type
const Query = queryType({
  definition(t) {
    // OFFSET-BASED
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
    
    // CURSOR-BASED
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
```
    
14. Database Migration - using Lift
    The last step is to apply our database migration using `Lift` to actually setup the SQLite database. **First,** you need to run `prisma2 lift save` to prepare our migration. Terminal will prompt for a name for the migration, which is up to you! After you name the migration, you need to actually apply the changes to our database. To do this, you run `prisma2 lift up` and our database will be up-to-date. Now you can test our queries by running our ApolloServer and use GraphQL playground! 

    You will also need to seed your database with some post records. You can handle this **(a) manually** using `Prisma Studio`, which can be thought of as an *IDE to your database*, providing a web-based interface to handle the data in the database. You can run access `Prisma Studio` by running `prisma2 dev` in the *root project directory* and visting the output url (localhost:5555 by default). **(b)** If you are having issues doing this manually, you can also **(2) handle it programatically** by running a function in apollo-server that *creates a record* from the `photon client`.
    
```js
async function seedDb() {
  try {
    // create a user
    const user = await photon.users.create({
      data: {
        email: 'alicde4sc@f43prisma.io',
        name: 'alice',
      }
    })
    // create a post
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
```

15. Now you are ready to query against the GraphQL endpoint using the respective postsOffset or postsCursor queries to retrieve paginated results! Congratulations!
