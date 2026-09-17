# ---------- Build stage ----------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -q dependency:go-offline
COPY src/ src/
RUN ./mvnw -q -DskipTests package && \
    java -Djarmode=tools -jar target/focus-nagi-*.jar extract --layers --launcher --destination target/extracted

# ---------- Runtime stage ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /build/target/extracted/dependencies/ ./
COPY --from=build --chown=app:app /build/target/extracted/spring-boot-loader/ ./
COPY --from=build --chown=app:app /build/target/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=app:app /build/target/extracted/application/ ./
USER app
EXPOSE 8080
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
