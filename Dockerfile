FROM keymetrics/pm2:14-alpine
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package.json /usr/src/app/
ENV NPM_CONFIG_LOGLEVEL warn
RUN apk update && apk add git python pango pango-dev libjpeg-turbo-dev cairo cairo-dev pixman pixman-dev alpine-sdk && rm -rf /var/cache/apk/*
RUN npm install
COPY . /usr/src/app
RUN npm run postinstall
RUN npm install -g pm2
EXPOSE 3000 3001 8080 9229
ENTRYPOINT [ "pm2-runtime", "start", "pm2.config.js" ]
