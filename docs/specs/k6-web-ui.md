use fgd

in this repository, i want to create k6-studio-web using next.js fullstack

[Web UI dashboard]
+-------------------+   +-------------------------------------------------------------------------+
|                   |   |   Editor Tab   |    Live Dashboard    |           Test History          |
|                   |   +                +----------------------+---------------------------------+
|                   |   |                                                                         |
|                   |   |  [save]  [run]                                                          |
|                   |   |                                                                         |
|                   |   |  +-------------------------------------------------------------------+  |
|   File Explorer   |   |  |                                                                   |  |
|       Tree        |   |  |                              Editor                               |  |
|                   |   |  |                                                                   |  |
|                   |   |  +-------------------------------------------------------------------+  |
|                   |   |                                                                         |
|                   |   +-------------------------------------------------------------------------+
|                   |   +-------------------------------------------------------------------------+
|                   |   |                                                                         |
|                   |   |                                                                         |
|                   |   |                               Terminal                                  |
|                   |   |                                                                         |
|                   |   |                                                                         |
+-------------------+   +-------------------------------------------------------------------------+
1. file and folder explorer to manage scripts in the left side
2. Editor Tab
    a. Editor : typescript code editor. had run and save button.
    b. Read-only Terminal to show the output of running k6
3. Live Dashboard Tab
    - we will use microfrontend to port the k6 load test dashboard so user no need to open new tab to see different web page
4. Test history
    - list of k6 load test report html 

[Storage]
- use minio to mimic s3 for now

[Security]
- no auth for now

[Dockerfile Bundle]
- we will run next js in the docker image which contains k6 inside
- this dockerfile will be used for our deployment
- create docker compose to manage orchestration in local first