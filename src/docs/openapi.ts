export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "ProcessIQ Document Service API",
    version: "1.0.0",
    description: "API de generation de documents PDF avec traitement asynchrone par batch."
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Environnement local"
    }
  ],
  tags: [
    {
      name: "Health",
      description: "Etat du service"
    },
    {
      name: "Metrics",
      description: "Metriques"
    },
    {
      name: "Documents",
      description: "Creation et suivi des batches"
    }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Retourner l'etat du service",
        responses: {
          "200": {
            description: "Etat courant du service",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse"
                },
                examples: {
                  healthy: {
                    value: {
                      status: "ok",
                      mongo: {
                        status: "up",
                        readyState: 1
                      },
                      redis: {
                        status: "up"
                      },
                      queue: {
                        status: "up",
                        backend: "bull",
                        redis: {
                          status: "up"
                        },
                        queue: {
                          waiting: 0,
                          active: 2,
                          completed: 150,
                          failed: 0,
                          delayed: 0
                        }
                      },
                      circuitBreaker: {
                        state: "closed",
                        consecutiveFailures: 0,
                        openedAt: null
                      }
                    }
                  }
                }
              }
            }
          },
          "503": {
            description: "Service indisponible",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse"
                }
              }
            }
          }
        }
      }
    },
    "/metrics": {
      get: {
        tags: ["Metrics"],
        summary: "Retourner les metriques Prometheus",
        responses: {
          "200": {
            description: "Metriques Prometheus",
            content: {
              "text/plain": {
                schema: {
                  type: "string"
                },
                examples: {
                  prometheus: {
                    value:
                      "# HELP documents_generated_total Nombre total de documents traites par le service\n# TYPE documents_generated_total counter\ndocuments_generated_total{status=\"completed\",queue_backend=\"bull\"} 1000"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Retourner l'etat du service",
        responses: {
          "200": {
            description: "Etat courant du service",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse"
                }
              }
            }
          },
          "503": {
            description: "Service indisponible",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/metrics": {
      get: {
        tags: ["Metrics"],
        summary: "Retourner les metriques au format JSON",
        responses: {
          "200": {
            description: "Metriques du service",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonMetricsResponse"
                },
                examples: {
                  metrics: {
                    value: {
                      queueName: "document-generation",
                      concurrency: 25,
                      retryAttempts: 3,
                      backoffDelayMs: 1000,
                      pdfTemplateName: "cerfa",
                      pdfWorkerThreads: 4,
                      pdfRenderTimeoutMs: 5000,
                      queueBackend: "bull",
                      docusignCircuitBreaker: {
                        state: "closed",
                        consecutiveFailures: 0,
                        openedAt: null
                      },
                      jobs: {
                        waiting: 0,
                        active: 0,
                        completed: 1000,
                        failed: 0,
                        delayed: 0
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/documents/batch": {
      post: {
        tags: ["Documents"],
        summary: "Creer un batch de documents",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/BatchCreateRequest"
              },
              examples: {
                thousandUsers: {
                  value: {
                    userIds: ["user-1", "user-2", "user-3"]
                  }
                }
              }
            }
          }
        },
        responses: {
          "202": {
            description: "Batch cree",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BatchCreateAccepted"
                },
                examples: {
                  accepted: {
                    value: {
                      batchId: "69cab71166813637427aafd8",
                      status: "pending",
                      totalDocuments: 3
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Requete invalide",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            description: "MongoDB indisponible",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/documents/batch/{batchId}": {
      get: {
        tags: ["Documents"],
        summary: "Retourner le detail d'un batch",
        parameters: [
          {
            in: "path",
            name: "batchId",
            required: true,
            schema: {
              type: "string"
            },
            example: "69cab71166813637427aafd8"
          }
        ],
        responses: {
          "200": {
            description: "Detail du batch",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BatchStatusResponse"
                },
                examples: {
                  completed: {
                    value: {
                      batchId: "69cab71166813637427aafd8",
                      status: "completed",
                      totalDocuments: 3,
                      processedDocuments: 3,
                      completedDocuments: 3,
                      failedDocuments: 0,
                      startedAt: "2026-03-30T17:47:00.000Z",
                      completedAt: "2026-03-30T17:47:47.874Z",
                      documents: [
                        {
                          documentId: "69cab71166813637427aaff0",
                          userId: "user-1",
                          status: "completed",
                          attempts: 1,
                          templateName: "cerfa",
                          errorMessage: null,
                          generatedAt: "2026-03-30T17:47:10.000Z",
                          fileSizeBytes: 20480,
                          renderDurationMs: 612,
                          downloadUrl: "/api/documents/69cab71166813637427aaff0"
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          "404": {
            description: "Batch introuvable",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/documents/{documentId}": {
      get: {
        tags: ["Documents"],
        summary: "Recuperer un PDF genere",
        parameters: [
          {
            in: "path",
            name: "documentId",
            required: true,
            schema: {
              type: "string"
            },
            example: "69cab71166813637427aaff0"
          }
        ],
        responses: {
          "200": {
            description: "Fichier PDF",
            content: {
              "application/pdf": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              }
            }
          },
          "409": {
            description: "Document pas encore pret",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Document introuvable",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      BatchCreateRequest: {
        type: "object",
        required: ["userIds"],
        properties: {
          userIds: {
            type: "array",
            minItems: 1,
            maxItems: 1000,
            items: {
              type: "string"
            }
          }
        }
      },
      BatchCreateAccepted: {
        type: "object",
        required: ["batchId", "status", "totalDocuments"],
        properties: {
          batchId: {
            type: "string"
          },
          status: {
            type: "string",
            enum: ["pending", "processing", "completed", "failed"]
          },
          totalDocuments: {
            type: "integer"
          }
        }
      },
      BatchDocument: {
        type: "object",
        properties: {
          documentId: {
            type: "string"
          },
          userId: {
            type: "string"
          },
          status: {
            type: "string",
            enum: ["pending", "processing", "completed", "failed"]
          },
          attempts: {
            type: "integer"
          },
          templateName: {
            type: "string"
          },
          errorMessage: {
            type: "string",
            nullable: true
          },
          generatedAt: {
            type: "string",
            format: "date-time",
            nullable: true
          },
          fileSizeBytes: {
            type: "integer",
            nullable: true
          },
          renderDurationMs: {
            type: "integer",
            nullable: true
          },
          downloadUrl: {
            type: "string",
            nullable: true
          }
        }
      },
      BatchStatusResponse: {
        type: "object",
        properties: {
          batchId: {
            type: "string"
          },
          status: {
            type: "string",
            enum: ["pending", "processing", "completed", "failed"]
          },
          totalDocuments: {
            type: "integer"
          },
          processedDocuments: {
            type: "integer"
          },
          completedDocuments: {
            type: "integer"
          },
          failedDocuments: {
            type: "integer"
          },
          startedAt: {
            type: "string",
            format: "date-time",
            nullable: true
          },
          completedAt: {
            type: "string",
            format: "date-time",
            nullable: true
          },
          documents: {
            type: "array",
            items: {
              $ref: "#/components/schemas/BatchDocument"
            }
          }
        }
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["ok", "degraded", "down"]
          },
          mongo: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["up", "down"]
              },
              readyState: {
                type: "integer"
              },
              error: {
                type: "string",
                nullable: true
              }
            }
          },
          redis: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["up", "down"]
              },
              error: {
                type: "string",
                nullable: true
              }
            }
          },
          queue: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["up", "degraded", "down"]
              },
              backend: {
                type: "string",
                enum: ["bull", "memory"]
              },
              redis: {
                type: "object",
                properties: {
                  status: {
                    type: "string",
                    enum: ["up", "down"]
                  },
                  error: {
                    type: "string",
                    nullable: true
                  }
                }
              },
              queue: {
                type: "object",
                properties: {
                  waiting: { type: "integer" },
                  active: { type: "integer" },
                  completed: { type: "integer" },
                  failed: { type: "integer" },
                  delayed: { type: "integer" }
                }
              }
            }
          },
          circuitBreaker: {
            $ref: "#/components/schemas/CircuitBreakerStatus"
          }
        }
      },
      JsonMetricsResponse: {
        type: "object",
        properties: {
          queueName: { type: "string" },
          concurrency: { type: "integer" },
          retryAttempts: { type: "integer" },
          backoffDelayMs: { type: "integer" },
          pdfTemplateName: { type: "string" },
          pdfWorkerThreads: { type: "integer" },
          pdfRenderTimeoutMs: { type: "integer" },
          queueBackend: {
            type: "string",
            enum: ["bull", "memory"]
          },
          docusignCircuitBreaker: {
            $ref: "#/components/schemas/CircuitBreakerStatus"
          },
          jobs: {
            type: "object",
            properties: {
              waiting: { type: "integer" },
              active: { type: "integer" },
              completed: { type: "integer" },
              failed: { type: "integer" },
              delayed: { type: "integer" }
            }
          }
        }
      },
      CircuitBreakerStatus: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["closed", "open", "half-open"]
          },
          consecutiveFailures: {
            type: "integer"
          },
          lastError: {
            type: "string",
            nullable: true
          },
          openedAt: {
            type: "string",
            nullable: true
          }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          message: {
            type: "string"
          },
          details: {
            nullable: true
          }
        }
      }
    }
  }
} as const;
