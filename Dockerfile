FROM node:lts-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY ./index.js .
CMD [ "node", "index.js" ]