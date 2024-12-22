ARG NODE_VERSION=18

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /opt

COPY package.json .env yarn.lock tsconfig.json tsconfig.compile.json .barrelsby.json ./

RUN yarn install --pure-lockfile


COPY ./src ./src
COPY ./ssl ./ssl

RUN yarn build



FROM node:${NODE_VERSION}-slim AS runtime
ENV WORKDIR=/opt
WORKDIR $WORKDIR

RUN npm install -g pm2

COPY --from=build /opt .

RUN yarn install --pure-lockfile --production

COPY ./views ./views
COPY processes.config.js .

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=pro

CMD ["pm2-runtime", "start", "processes.config.js", "--env", "production"]