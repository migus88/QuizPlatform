FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

COPY QuizPlatform.sln ./
COPY api/QuizPlatform.Api.csproj api/
RUN dotnet restore api/QuizPlatform.Api.csproj

COPY . .
RUN dotnet publish api/QuizPlatform.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "QuizPlatform.Api.dll"]
