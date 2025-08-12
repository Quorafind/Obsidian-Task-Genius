# Test Project Tree View

## Test nested projects with slashes

- [ ] Task in root project #project/RootProject
- [ ] Task in sub project #project/RootProject/SubProject1  
- [ ] Another task in sub project #project/RootProject/SubProject1
- [ ] Task in another sub project #project/RootProject/SubProject2
- [ ] Task in deeply nested project #project/RootProject/SubProject1/GrandChild
- [ ] Task in different root #project/AnotherRoot
- [ ] Task in different sub #project/AnotherRoot/Child

## Test with metadata project field

- [ ] Task with metadata project [project:: WebDev/Frontend]
- [ ] Task with nested metadata [project:: WebDev/Frontend/React]
- [ ] Task with another nested [project:: WebDev/Backend/API]

## Test with tgProject

Here we simulate tasks that have tgProject from path-based detection.

- [ ] Task with simple project [project:: SimpleProject]
- [ ] Mixed style project #project/MixedStyle/SubLevel