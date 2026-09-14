FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY Extractor.csproj Program.cs ./
# Override an upstream transitive dependency affected by CVE-2026-26127.
RUN dotnet add package Microsoft.Bcl.Memory --version 9.0.14 \
    && dotnet publish -c Release -o /app --no-self-contained

FROM mcr.microsoft.com/dotnet/runtime:10.0-noble
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "/app/Extractor.dll"]
