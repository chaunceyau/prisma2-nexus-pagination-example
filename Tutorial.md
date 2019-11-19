# Understanding Pagination with the Prisma Framework and GraphQL
In this tutorial, you will learn the fundamentals of implementing pagination with the [Prisma Framework](https://www.prisma.io/blog/announcing-prisma-2-zq1s745db8i5#getting-started-with-prisma-2). If you are unfamiliar with the Prisma Framework, definitely start by exploring the [Prisma Website](https://www.prisma.io). Prisma2 is rewrite  of the original Prisma, with two tools for handling your database workflows: Photon and Lift. You can read more about both tools and the motivation on the [Prisma 2 Preview blog post](https://www.prisma.io/blog/announcing-prisma-2-zq1s745db8i5).

## Pagination: Offset-based vs Cursor-based
There are many ways to do pagination, but the two main ways to focus on today are **Offset-based** and **Cursor-based**. The primary difference between these two approaches is the the way **you specify the first record** to fetch in our database for the request. Both approaches you typically provide a **limit/count**, which is the **number of additional records** to retrieve **after the first record** you specify. 

Using the **offset-based** approach, the request specifies the **number of records to skip** (a.k.a. the offset). Using the **cursor-based** approach, the request specifies **a unique identifier of the first record to start from** (a.k.a. the cursor). 

### Pros & Cons
***Offset-based*** pagination has some benefits in that clients can easily move between pages and see the total number of results, which are lost in ***cursor-based***. The two issues with ***offset-based*** pagination is ***(1)*** potential loss of speed at scale - db still reads data from the disk up to the offset + count and ***(2)\**** unstable to use numerical offset with faster changing data - the record at offset ***5***, is no longer ***5*** when a new record is added to the collection.

* Imagine the scenario in the image. 1. *User A* starts by requesting records 1-4. 2. *User B* adds a new record to the collection. 3. *User A* now requests records 5-9. - As all of the records have now shifted, the *request for records 5-9* will include *record 4* that was in the original request.

![offset issue with new record](https://i.imgur.com/rHcE98N.png)


When using ***cursor-based*** pagination, a couple issues we come across are losing the concept of the total number of pages/results in the set, and the client can no longer jump to a specific page. Otherwise, ***cursor-based*** solutions tend to be more flexible and are the go-to option with rapidly changing data.

If you'd like to learn more about the pros & cons of each approach, you should [read this blog post](https://slack.engineering/evolving-api-pagination-at-slack-1c1f644f8e12) written by the Slack development team.

![lowfi difference between cursor and offset](https://i.imgur.com/i16d0DH.png)

## Libraries Overview
Below are the libraries you will use to build our GraphQL API that will allow us to request paginated results. There is a brief description of what each library does.
1. **prisma2:** *photon:* type-safe data access client & *lift:* for db migrations
2. **express:** node.js server
3. **apollo-server-express:** graphql server
4. **nexus:** code-first graphql schema
5. **nexus-prisma:** bindings between nexus and prisma
6. **graphql:** peer dependency

![main libraries](https://i.imgur.com/GpU8R3z.png)

## Implementation Overview
You will now get hands on and create a pagination example using the following technologies: GraphQL, Prisma, Photon/Lift, Nexus, Nexus-Prisma,  and SQLite. Using these technologies, you can get a functional example of pagination running in less than 30 minutes. Here is a high-level overview of the steps that will be envolved in the process.

1. Install Prisma2
2. Follow through Prisma2 CLI to create project with Photon and Lift
3. Add the libraries to provide functionality
4. Setup apollo-server-express 
5. Setup types/resolvers with Nexus
6. Add pagination functionality
7. Database migration

## Demo Tutorial

### 1. **npx prisma2 init pagination-example**
  Follow the prompts with these options: 
1. blank project
2. SQLite
3. include photon and lift -> confirm
4. JavaScript - feel free to use TypeScript 
5. Just the prisma schema. You should now have a folder called *pagination-example* with a prisma folder inside.

### 2. **npm init** - select defaults - should run in *pagination-example* directory
This will walk you through creating a package.json for your project.
### 3. **package.json** - add to scripts to run apollo server & generate db schema
        
```js
"dev": "node ./index.js",
"postinstall": "prisma2 generate"
```

### 4. **npm i prisma2 --save-dev**
You will notice this likely unfamiliar line print in the console: *"Downloading darwin binary for query-engine and migration-engine"*. This is the postinstallation hook running and generating the Photon client.
### 5. **npm i express apollo-server-express nexus nexus-prisma graphql**
  Take a look at the [Libraries Overview](#libraries-overview) section to understand what each library does.
### 6. **Create index.js file for apollo-server and add Photon client**
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
        
### 7. **Add GraphQL Nexus -** Rather than the standard apollo server typedefs and resolvers, you are going to use GraphQL nexus.

1. Photon is our type-safe database access client 
2. nexus allows us to take code-first approach to creating our api
3. nexus-prisma is the plugin which you use for the t.model.** below

```js
// index.js
const { Photon } = require('@generated/photon')
const photon = new Photon()
const { objectType, queryType, makeSchema } = require("nexus")
const { nexusPrismaPlugin } = require('nexus-prisma')
const { join } = require('path')
```
      
Next, you have to add the models you wish to expose in our API. This is similar to the typeDefs used in a standard Apollo Server without Nexus. The first two items created below is an *objectType* for both User and Post. This exposes these from our database.

```js 
// index.js
const User = objectType({
  name: 'User',
  definition(t) {
    t.model.id(),
    t.model.email()
  }
})

const Post = objectType({
  name: 'Post',
  definition(t) {
    t.model.id(),
    t.model.title(),
    t.model.author()
  }
})
```

In the Query you define using *queryType*, you can start to expose queries you want to enable clients to run. 
```js 
// index.js
const Query = queryType({
  definition(t) {
    // you will add pagination queries here
  }
});
```

Finally, you create a schema using *makeSchema*, which includes your types, a plugin for nexus-prism and a path to output.
```js
// index.js
const schema = makeSchema({
  types: [Query, User, Post],
  plugins: [nexusPrismaPlugin()],
  outputs: {
    typegen: join(
      __dirname,
      '../node_modules/@types/nexus-typegen/index.d.ts',
    ),
  },
});
```
You also need to update our ApolloServer constructor to include our schema and photon instance.

```js
// index.js
const server = new ApolloServer({ schema, context: { photon } })
```

### 8. Add Pagination Query
Now you need to update our Query type to include a query that you can use to request paginated results. Notice in the args object, you provide the arguments the query can accept. The resolve function handles the logic of returning a result from the request. The context object is provided as a parameter to the resolve function, which gives access to the photon instance.

Records can be select before and after a cursor, so you have to handle both cases. Thanks to Photon and Nexus-Prisma, you have out-of-the-box for pagination and can easily implement it using the *after, first and last* options.

```js
const Query = queryType({
  definition(t) {
    t.list.field('posts', {
      type: 'Post',
      args: {
        cursor: idArg(),
        first: intArg(),
        last: intArg()
      },
      resolve: async (parent, { cursor, first, last }, ctx) => {
        let posts = []
        try {
          if (first)
            posts = await ctx.photon.posts.findMany({ after: cursor, first })
          else if (last)
            posts = await ctx.photon.posts.findMany({ before: cursor, last })
          else
            posts = await ctx.photon.posts.findMany({ first: 10 })
        } catch (error) { console.log(error) }

        return posts
      }
    })
  }
});
```
    
### 9. Database Migration - using Lift
The last step is to apply our database migration using Lift to actually setup the SQLite database. **First,** you need to run `prisma2 lift save` to prepare our migration. Terminal will prompt for a name for the migration, which is up to you! After you name the migration, you need to actually apply the changes to our database. To do this, you run `prisma2 lift up` and our database will be up-to-date. Now you can test our queries by running our ApolloServer and use GraphQL playground! 

    You will also need to seed your database with some post records. You can handle this **(a) manually** using Prisma Studio, which can be thought of as an *IDE to your database*, providing a web-based interface to handle the data in the database. You can run access Prisma Studio by running `prisma2 dev` in the *root project directory* and visting the output url (localhost:5555 by default). **(b)** If you are having issues doing this manually, you can also **(2) handle it programatically** by running a function in apollo-server that *creates a record* from the photon client.
    
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

10. Now you are ready to query against the GraphQL endpoint using the respective postsOffset or postsCursor queries to retrieve paginated results! Congratulations!

## Wrap Up
Hopefully this provided an overview of the simplicity and power of Prisma2. With the auto-generated photon client, developers can add pagination to a project very quickly. Nexus is not a neccesity in this scenario, but can be a very powerful approach to schema development. If you have any questions, feel free to leave them in the comments and we will hope to help clarify and issues you have!
