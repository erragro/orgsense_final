"""
Weaviate Client
===============

Production-grade wrapper around Weaviate.

Responsibilities:
- Initialize connection
- Ensure KBRule schema exists
- Delete vectors by policy_version
- Upsert rule vectors
- Version isolation enforcement

No DB logic.
No embedding logic.
Pure vector storage infrastructure.
"""

import os
import uuid
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from pathlib import Path
import weaviate


# ============================================================
# CONFIGURATION
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(PROJECT_ROOT / ".env")

WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "127.0.0.1")
WEAVIATE_HTTP_PORT = os.getenv("WEAVIATE_HTTP_PORT", "8080")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "")

WEAVIATE_URL = f"http://{WEAVIATE_HOST}:{WEAVIATE_HTTP_PORT}"
WEAVIATE_CLASS_NAME = "KBRule"
ISSUE_CLASS_NAME = "IssueType"
ACTION_CLASS_NAME = "ActionRegistry"
GUIDELINE_CLASS_NAME = "Guideline"
IMAGE_RULE_CLASS_NAME = "ImageRule"

logger = logging.getLogger("weaviate_client")
logger.setLevel(logging.INFO)


# ============================================================
# WEAVIATE CLIENT
# ============================================================

class WeaviateClient:

    def __init__(self):

        # Initialize connection with API key auth
        auth = weaviate.AuthApiKey(api_key=WEAVIATE_API_KEY) if WEAVIATE_API_KEY else None
        self.client = weaviate.Client(url=WEAVIATE_URL, auth_client_secret=auth)

        if not self.client.is_ready():
            raise RuntimeError("Weaviate instance is not ready")

        self._ensure_schema_exists()
        self._ensure_corpus_schemas()

    # --------------------------------------------------------
    # SCHEMA INITIALIZATION
    # --------------------------------------------------------

    def _ensure_schema_exists(self):
        """
        Ensures KBRule class exists.
        Creates it if missing.
        """

        schema = self.client.schema.get()

        existing_classes = [
            c["class"] for c in schema.get("classes", [])
        ]

        if WEAVIATE_CLASS_NAME in existing_classes:
            return

        logger.info("Creating Weaviate schema: KBRule")

        schema_definition = {
            "class": WEAVIATE_CLASS_NAME,
            "vectorizer": "none",
            "properties": [
                {"name": "rule_id", "dataType": ["text"]},
                {"name": "module_name", "dataType": ["text"]},
                {"name": "rule_type", "dataType": ["text"]},
                {"name": "policy_version", "dataType": ["text"]},
                {"name": "action_code_id", "dataType": ["text"]},
                {"name": "action_name", "dataType": ["text"]},
                {"name": "semantic_text", "dataType": ["text"]}
            ]
        }

        self.client.schema.create_class(schema_definition)

    def _ensure_corpus_schemas(self):
        """
        Ensure auxiliary corpora schemas exist for retrieval.
        """
        schema = self.client.schema.get()
        existing_classes = [c["class"] for c in schema.get("classes", [])]

        corpus_defs = [
            {
                "class": ISSUE_CLASS_NAME,
                "vectorizer": "none",
                "properties": [
                    {"name": "issue_code", "dataType": ["text"]},
                    {"name": "label", "dataType": ["text"]},
                    {"name": "description", "dataType": ["text"]},
                    {"name": "level", "dataType": ["int"]},
                    {"name": "is_active", "dataType": ["boolean"]},
                    {"name": "corpus_version", "dataType": ["text"]},
                    {"name": "semantic_text", "dataType": ["text"]},
                ],
            },
            {
                "class": ACTION_CLASS_NAME,
                "vectorizer": "none",
                "properties": [
                    {"name": "action_code_id", "dataType": ["text"]},
                    {"name": "action_key", "dataType": ["text"]},
                    {"name": "action_name", "dataType": ["text"]},
                    {"name": "action_description", "dataType": ["text"]},
                    {"name": "requires_refund", "dataType": ["boolean"]},
                    {"name": "requires_escalation", "dataType": ["boolean"]},
                    {"name": "automation_eligible", "dataType": ["boolean"]},
                    {"name": "corpus_version", "dataType": ["text"]},
                    {"name": "semantic_text", "dataType": ["text"]},
                ],
            },
            {
                "class": GUIDELINE_CLASS_NAME,
                "vectorizer": "none",
                "properties": [
                    {"name": "guideline_key", "dataType": ["text"]},
                    {"name": "title", "dataType": ["text"]},
                    {"name": "content", "dataType": ["text"]},
                    {"name": "tags", "dataType": ["text[]"]},
                    {"name": "corpus_version", "dataType": ["text"]},
                    {"name": "semantic_text", "dataType": ["text"]},
                ],
            },
            {
                "class": IMAGE_RULE_CLASS_NAME,
                "vectorizer": "none",
                "properties": [
                    {"name": "rule_key", "dataType": ["text"]},
                    {"name": "title", "dataType": ["text"]},
                    {"name": "description", "dataType": ["text"]},
                    {"name": "issue_type_l1", "dataType": ["text"]},
                    {"name": "issue_type_l2", "dataType": ["text"]},
                    {"name": "requires_image", "dataType": ["boolean"]},
                    {"name": "corpus_version", "dataType": ["text"]},
                    {"name": "semantic_text", "dataType": ["text"]},
                ],
            },
        ]

        for definition in corpus_defs:
            if definition["class"] in existing_classes:
                continue
            logger.info("Creating Weaviate schema: %s", definition["class"])
            self.client.schema.create_class(definition)

    # --------------------------------------------------------
    # DELETE VECTORS BY POLICY VERSION
    # --------------------------------------------------------

    def delete_by_policy_version(self, policy_version: str):
        """
        Deletes all KBRule objects for a specific policy version.
        Ensures no stale vectors remain.
        """

        logger.info(
            f"Deleting existing vectors for policy_version={policy_version}"
        )

        self.client.batch.delete_objects(
            class_name=WEAVIATE_CLASS_NAME,
            where={
                "path": ["policy_version"],
                "operator": "Equal",
                "valueText": policy_version
            }
        )

    # --------------------------------------------------------
    # UPSERT RULE VECTORS
    # --------------------------------------------------------

    def upsert_rules(
        self,
        policy_version: str,
        rules: List[Dict[str, Any]]
    ):
        """
        Inserts rule vectors into Weaviate.
        """

        logger.info(
            f"Upserting {len(rules)} vectors for version={policy_version}"
        )

        with self.client.batch as batch:

            batch.batch_size = 50

            for rule in rules:

                deterministic_uuid = uuid.uuid5(
                    uuid.NAMESPACE_DNS,
                    f"{policy_version}_{rule['rule_id']}"
                )

                batch.add_data_object(
                    data_object={
                        "rule_id": rule["rule_id"],
                        "module_name": rule["module_name"],
                        "rule_type": rule["rule_type"],
                        "policy_version": policy_version,
                        "action_code_id": rule["action_code_id"],
                        "action_name": rule["action_name"],
                        "semantic_text": rule["semantic_text"]
                    },
                    class_name=WEAVIATE_CLASS_NAME,
                    uuid=str(deterministic_uuid),
                    vector=rule["vector"]
                )

    # --------------------------------------------------------
    # RETRIEVE TOP-K RULES
    # --------------------------------------------------------

    def query_similar_rules(
        self,
        vector: List[float],
        policy_version: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Retrieve top-k similar rules restricted to policy version.
        """

        result = (
            self.client.query
            .get(WEAVIATE_CLASS_NAME, [
                "rule_id",
                "module_name",
                "rule_type",
                "action_code_id",
                "action_name",
                "semantic_text"
            ])
            .with_near_vector({"vector": vector})
            .with_where({
                "path": ["policy_version"],
                "operator": "Equal",
                "valueText": policy_version
            })
            .with_limit(top_k)
            .do()
        )

        return result["data"]["Get"].get(WEAVIATE_CLASS_NAME, [])

    def upsert_corpus_objects(
        self,
        class_name: str,
        objects: List[Dict[str, Any]],
        id_key: str,
    ):
        """
        Upsert objects with explicit vectors for a given corpus class.
        """
        if not objects:
            return

        with self.client.batch as batch:
            batch.batch_size = 50
            for obj in objects:
                deterministic_uuid = uuid.uuid5(
                    uuid.NAMESPACE_DNS,
                    f"{class_name}_{obj[id_key]}"
                )
                vector = obj.pop("vector")
                batch.add_data_object(
                    data_object=obj,
                    class_name=class_name,
                    uuid=str(deterministic_uuid),
                    vector=vector
                )

    def query_similar(
        self,
        class_name: str,
        vector: List[float],
        filters: Dict[str, Any] | None = None,
        top_k: int = 5,
        fields: List[str] | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Generic similarity search with optional filters.
        """
        if not fields:
            fields = ["semantic_text"]

        query = self.client.query.get(class_name, fields).with_near_vector({"vector": vector})
        if filters:
            query = query.with_where(filters)
        result = query.with_limit(top_k).do()
        return result["data"]["Get"].get(class_name, [])
