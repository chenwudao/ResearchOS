"""A runnable reference adapter: one algorithm/seed/budget produces one JSON result."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import time
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

parser = argparse.ArgumentParser()
parser.add_argument('--method', required=True, choices=['random_forest', 'extra_trees', 'logistic'])
parser.add_argument('--seed', type=int, required=True)
parser.add_argument('--budget', type=int, required=True)
parser.add_argument('--metrics', required=True)
args = parser.parse_args()
dataset = Path(__file__).with_name('dataset.csv')
with dataset.open(encoding='utf-8', newline='') as file:
    rows = list(csv.DictReader(file))
x = np.array([[float(row['x' + str(i)]) for i in range(10)] for row in rows])
y = np.array([int(row['target']) for row in rows])
pool, validation = train_test_split(np.arange(len(y)), test_size=.25, random_state=args.seed, stratify=y)
training, _ = train_test_split(pool, train_size=args.budget, random_state=args.seed, stratify=y[pool])
models = {
    'random_forest': RandomForestClassifier(n_estimators=80, random_state=args.seed, n_jobs=1),
    'extra_trees': ExtraTreesClassifier(n_estimators=80, random_state=args.seed, n_jobs=1),
    'logistic': make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, random_state=args.seed)),
}
model = models[args.method]
started = time.monotonic()
model.fit(x[training], y[training])
predicted = model.predict(x[validation])
split_id = hashlib.sha256(json.dumps({'train': training.tolist(), 'validation': validation.tolist()}).encode()).hexdigest()
result = {'accuracy': accuracy_score(y[validation], predicted),
          'balanced_accuracy': balanced_accuracy_score(y[validation], predicted),
          'fit_seconds': time.monotonic() - started, 'split_id': split_id,
          'seed': args.seed, 'budget': args.budget, 'n_validation': len(validation)}
Path(args.metrics).write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
